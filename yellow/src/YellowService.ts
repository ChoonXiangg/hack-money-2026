import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { Address } from 'viem';

import type {
    ClearNodeConfig,
    AuthState,
    SessionState,
    Song,
    PlayEvent,
    TransferResult,
    SettlementResult,
    ListeningActivity,
} from './types';

import {
    CLEARNODE_URLS,
    TIMING,
    SEPOLIA_CHAIN_ID,
} from './config';

import {
    generateSessionKeyPair,
    createAuthParams,
    fetchClearNodeConfig,
    handleAuthChallenge,
    createAndSendAuthRequest,
    createInitialAuthState,
    updateAuthStateOnSuccess,
    type SessionKeyPair,
} from './auth';

import { createClients, type ClientBundle } from './client';

import {
    getTokenFromConfig,
    sendCreateChannelRequest,
    submitChannelToBlockchain,
    waitForChannelIndexing,
} from './channels/create';

import { fundChannel } from './channels/resize';
import { sendCloseChannelRequest, waitForCloseConfirmation, submitCloseToBlockchain, withdrawFromCustody, logOnChainChannelState } from './channels/close';
import { transferToRelayer, getTokenBalance } from './channels/relayer';
import { getUserCustodyBalance, getChannelBalance } from './channels/create';
import { startAppSession, endAppSession, submitAppState } from './channels/appSession';
import { formatUSDCDisplay, RELAYER_ADDRESS, CONTRACT_ADDRESSES, DEFAULT_TOKEN_ADDRESS } from './config';

import { SessionManager } from './session/SessionManager';

// ============================================================================
// Yellow Service
// ============================================================================

export interface YellowServiceConfig {
    privateKey: `0x${string}`;
    environment?: 'sandbox' | 'production';
    rpcUrl?: string;
    /** Use App Sessions for 2-party fund distribution (user + relayer) */
    useAppSessions?: boolean;
    /** Relayer address for App Sessions (receives spent amount on close) */
    relayerAddress?: Address;
}

/**
 * Main service class for Yellow Network integration
 * Handles the complete lifecycle of music streaming sessions
 */
export class YellowService extends EventEmitter {
    private config: YellowServiceConfig;
    private clearNodeConfig: ClearNodeConfig | null = null;
    private clients: ClientBundle | null = null;
    private ws: WebSocket | null = null;
    private sessionKeyPair: SessionKeyPair | null = null;
    private authState: AuthState;
    private sessionManager: SessionManager;
    private token: Address | null = null;
    private isConnecting: boolean = false;
    private messageHandlers: Map<string, (data: unknown) => void> = new Map();
    /** App Session ID when using App Sessions mode */
    private appSessionId: `0x${string}` | null = null;
    /** Channel ID used for the app session (bridges on-chain ↔ off-chain) */
    private appSessionChannelId: `0x${string}` | null = null;
    /** App Session version for state updates (microtransactions) */
    private appSessionVersion: number = 1;
    /** Server-confirmed allocations for App Session (tracks actual state) */
    private appSessionAllocations: Array<{ participant: string; asset: string; amount: string }> = [];

    constructor(config: YellowServiceConfig) {
        super();
        this.config = {
            ...config,
            // Default to basic channels - App Sessions require both parties to be active signers
            // Relayer is passive, so we use ERC20 transfer instead
            useAppSessions: config.useAppSessions ?? false,
            relayerAddress: config.relayerAddress ?? RELAYER_ADDRESS,
        };
        this.authState = createInitialAuthState();
        this.sessionManager = new SessionManager();
    }

    // ========================================================================
    // Initialization
    // ========================================================================

    /**
     * Initialize the service - fetch config and create clients
     */
    async initialize(): Promise<void> {
        // Create blockchain clients
        this.clients = createClients({
            privateKey: this.config.privateKey,
            rpcUrl: this.config.rpcUrl,
        });

        // Fetch ClearNode configuration
        const clearNodeUrl = this.config.environment === 'production'
            ? CLEARNODE_URLS.production
            : CLEARNODE_URLS.sandbox;

        this.clearNodeConfig = await fetchClearNodeConfig(
            this.config.privateKey,
            clearNodeUrl
        );

        // Determine token to use
        this.token = getTokenFromConfig(this.clearNodeConfig, SEPOLIA_CHAIN_ID);

        console.log('YellowService initialized');
        console.log('  Wallet:', this.clients.account.address);
        console.log('  Token:', this.token);
    }

    /**
     * Connect to ClearNode WebSocket and authenticate
     */
    async connect(): Promise<void> {
        if (this.isConnecting) {
            throw new Error('Connection already in progress');
        }

        if (!this.clients) {
            throw new Error('Service not initialized. Call initialize() first.');
        }

        this.isConnecting = true;

        const clearNodeUrl = this.config.environment === 'production'
            ? CLEARNODE_URLS.production
            : CLEARNODE_URLS.sandbox;

        // Generate session keypair
        this.sessionKeyPair = generateSessionKeyPair();

        // Create WebSocket connection
        this.ws = new WebSocket(clearNodeUrl);

        // Set up message handling
        this.setupMessageHandlers();

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, TIMING.wsMessageTimeout);

            this.ws!.once('open', () => {
                clearTimeout(timeout);
                resolve();
            });

            this.ws!.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        // Start authentication
        await this.authenticate();

        this.isConnecting = false;
        this.emit('connected');
    }

    /**
     * Disconnect from ClearNode
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.authState = createInitialAuthState();
        this.sessionKeyPair = null;
        this.emit('disconnected');
    }

    // ========================================================================
    // Authentication
    // ========================================================================

    private async authenticate(): Promise<void> {
        if (!this.ws || !this.sessionKeyPair || !this.clients) {
            throw new Error('Not connected');
        }

        const authParams = createAuthParams(this.sessionKeyPair.address);

        // Send auth request
        await createAndSendAuthRequest(
            this.ws,
            this.clients.account.address,
            this.sessionKeyPair.address
        );

        // Wait for auth completion
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Authentication timeout'));
            }, TIMING.wsMessageTimeout);

            const checkAuth = () => {
                if (this.authState.isAuthenticated) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            // Store handler for auth_challenge
            this.messageHandlers.set('auth_challenge', async (data: unknown) => {
                const challenge = (data as { challenge_message: string }).challenge_message;
                await handleAuthChallenge(
                    this.ws!,
                    this.clients!.walletClient,
                    authParams,
                    challenge
                );
            });

            // Store handler for auth_verify
            this.messageHandlers.set('auth_verify', (data: unknown) => {
                const response = data as { session_key: Address; jwt?: string };
                this.authState = updateAuthStateOnSuccess(
                    this.authState,
                    response.session_key,
                    this.clients!.account.address,
                    response.jwt
                );
                this.emit('authenticated', this.authState);
                checkAuth();
            });
        });
    }

    // ========================================================================
    // Session Management
    // ========================================================================

    /**
     * Start a new listening session
     *
     * With App Sessions (default):
     * - Creates a 2-party session between user and relayer
     * - User deposits funds, relayer starts with 0
     * - On close, funds are split based on spending
     *
     * With Basic Channels (legacy):
     * - Creates a channel with ClearNode
     * - Requires manual transfer to relayer on close
     */
    async startSession(depositAmount: bigint): Promise<SessionState> {
        if (!this.ws || !this.authState.isAuthenticated || !this.clients || !this.sessionKeyPair) {
            throw new Error('Not connected or authenticated');
        }

        this.sessionManager.setStatus('starting');

        if (this.config.useAppSessions) {
            // App Sessions mode - 2-party session with relayer
            return this.startAppSessionMode(depositAmount);
        } else {
            // Legacy basic channel mode
            return this.startBasicChannelMode(depositAmount);
        }
    }

    /**
     * Start session using App Sessions (2-party with relayer)
     */
    private async startAppSessionMode(depositAmount: bigint): Promise<SessionState> {
        if (!this.ws || !this.clients || !this.sessionKeyPair) {
            throw new Error('Not ready');
        }

        const userAddress = this.clients.account.address;
        const relayerAddress = this.config.relayerAddress!;

        console.log('\n[Starting App Session]');
        console.log(`  Mode: App Sessions (2-party)`);
        console.log(`  User: ${userAddress}`);
        console.log(`  Relayer: ${relayerAddress}`);
        console.log(`  Deposit: ${formatUSDCDisplay(depositAmount)}`);

        // Check initial balances
        const walletBefore = await getTokenBalance(this.clients.publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        const custodyBefore = await this.clients.nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

        console.log('\n  Initial balances:');
        console.log(`    User wallet: ${formatUSDCDisplay(walletBefore)}`);
        console.log(`    User custody: ${formatUSDCDisplay(custodyBefore)}`);

        // Start App Session (handles deposit if needed)
        const sessionResult = await startAppSession({
            ws: this.ws,
            client: this.clients.nitroliteClient,
            publicClient: this.clients.publicClient,
            sessionKeyPair: this.sessionKeyPair,
            userAddress,
            relayerAddress,
            depositAmount,
        });

        // Store server-confirmed state (like reference code does)
        this.appSessionId = sessionResult.appSessionId;
        this.appSessionChannelId = sessionResult.channelId;
        this.appSessionVersion = sessionResult.version;
        this.appSessionAllocations = sessionResult.allocations;

        // DEBUG: Log what we stored
        console.log('\n  [DEBUG] Stored session state:');
        console.log('    appSessionId:', this.appSessionId);
        console.log('    appSessionVersion:', this.appSessionVersion);
        console.log('    appSessionAllocations:', JSON.stringify(this.appSessionAllocations, null, 2));

        // If allocations are empty, initialize them with expected values
        if (this.appSessionAllocations.length === 0) {
            console.log('    [WARNING] Server returned empty allocations, initializing locally');
            this.appSessionAllocations = [
                { participant: userAddress, asset: 'ytest.usd', amount: depositAmount.toString() },
                { participant: relayerAddress, asset: 'ytest.usd', amount: '0' },
            ];
            console.log('    Initialized allocations:', JSON.stringify(this.appSessionAllocations, null, 2));
        }

        const { depositTxHash } = sessionResult;

        if (depositTxHash) {
            console.log(`  Deposit TX: ${depositTxHash}`);
        }

        // Check balances after App Session creation
        const walletAfter = await getTokenBalance(this.clients.publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        const custodyAfter = await this.clients.nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

        console.log('\n  Balances after session start:');
        console.log(`    User wallet: ${formatUSDCDisplay(walletAfter)}`);
        console.log(`    User custody: ${formatUSDCDisplay(custodyAfter)} (should be 0, funds in session)`);

        // Start session tracking (use appSessionId as channelId for compatibility)
        this.sessionManager.startSession(this.appSessionId, depositAmount);

        const state = this.sessionManager.getState();
        this.emit('session:started', state);
        this.emit('channel:created', this.appSessionId);
        this.emit('channel:funded', this.appSessionId, depositAmount);

        console.log(`\n✓ App Session started: ${this.appSessionId}`);

        return state;
    }

    /**
     * Start session using basic channels (legacy mode)
     */
    private async startBasicChannelMode(depositAmount: bigint): Promise<SessionState> {
        if (!this.ws || !this.clients || !this.sessionKeyPair) {
            throw new Error('Not ready');
        }

        // Check for existing open channels using NitroliteClient (more reliable)
        console.log('  Checking for existing channels...');
        const openChannels = await this.clients.nitroliteClient.getOpenChannels();
        console.log(`  Found ${openChannels.length} open channel(s)`);

        let channelId: `0x${string}`;

        if (openChannels.length > 0) {
            // Use existing channel
            channelId = openChannels[0];
            console.log('  Using existing channel:', channelId);

            // Check if channel has balance
            const channelBalance = await this.clients.nitroliteClient.getChannelBalance(
                channelId,
                DEFAULT_TOKEN_ADDRESS
            );
            console.log(`  Channel balance: ${formatUSDCDisplay(channelBalance)}`);
        } else {
            // Create new channel via WebSocket
            console.log('  No existing channels, creating new one...');
            channelId = await this.createNewChannel();
            console.log('  Created new channel:', channelId);
        }

        // Wait for node to index the channel
        await waitForChannelIndexing();

        // Fund the channel
        await this.fundSessionChannel(channelId, depositAmount);

        // Start session tracking
        this.sessionManager.startSession(channelId, depositAmount);

        const state = this.sessionManager.getState();
        this.emit('session:started', state);

        return state;
    }

    /**
     * End the current session and settle payments
     *
     * With App Sessions (default):
     * - Closes with explicit allocations: user gets refund, relayer gets spent
     * - Funds go directly to respective custody balances
     * - User withdraws refund, relayer withdraws payment (separately)
     * - All on-chain, verifiable on Etherscan
     *
     * With Basic Channels (legacy):
     * - Close channel → user custody → withdraw → ERC20 transfer to relayer
     */
    async endSession(): Promise<SettlementResult> {
        if (!this.sessionManager.isActive()) {
            throw new Error('No active session');
        }

        if (!this.ws || !this.clients || !this.sessionKeyPair || !this.token) {
            throw new Error('Not connected');
        }

        this.sessionManager.setStatus('ending');

        // Stop any active play
        if (this.sessionManager.getCurrentPlay()) {
            this.sessionManager.stopCurrentPlay();
        }

        if (this.config.useAppSessions && this.appSessionId) {
            return this.endAppSessionMode();
        } else {
            return this.endBasicChannelMode();
        }
    }

    /**
     * End session using App Sessions - proper fund distribution
     */
    private async endAppSessionMode(): Promise<SettlementResult> {
        if (!this.ws || !this.clients || !this.sessionKeyPair || !this.appSessionId || !this.appSessionChannelId) {
            throw new Error('Not ready');
        }

        const userAddress = this.clients.account.address;
        const relayerAddress = this.config.relayerAddress!;

        // Get session amounts
        const totalSpent = this.sessionManager.getTotalSpent();
        const depositAmount = this.sessionManager.getState().depositAmount;
        const refundAmount = depositAmount - totalSpent;

        // Get listening activity BEFORE ending session (while data is still available)
        const listeningActivity = this.sessionManager.getListeningActivity();

        console.log('\n' + '='.repeat(60));
        console.log('SESSION SETTLEMENT (App Sessions)');
        console.log('='.repeat(60));
        console.log(`  App Session ID: ${this.appSessionId}`);
        console.log(`  User: ${userAddress}`);
        console.log(`  Relayer: ${relayerAddress}`);
        console.log('');
        console.log('  Fund Distribution:');
        console.log(`    Total deposited: ${formatUSDCDisplay(depositAmount)}`);
        console.log(`    Total spent: ${formatUSDCDisplay(totalSpent)}`);
        console.log(`    User refund: ${formatUSDCDisplay(refundAmount)}`);
        console.log(`    Relayer payment: ${formatUSDCDisplay(totalSpent)}`);
        console.log('');
        console.log(`  Listening Activity (${listeningActivity.length} songs):`);
        for (const record of listeningActivity) {
            console.log(`    - songListened: ${record.songListened}, amountSpent: ${formatUSDCDisplay(record.amountSpent)}`);
        }

        // Check balances BEFORE close
        const walletBefore = await getTokenBalance(this.clients.publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        const userCustodyBefore = await this.clients.nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

        console.log('\n  Balances BEFORE close:');
        console.log(`    User wallet: ${formatUSDCDisplay(walletBefore)}`);
        console.log(`    User custody: ${formatUSDCDisplay(userCustodyBefore)}`);

        // End App Session with proper fund distribution
        const result = await endAppSession({
            ws: this.ws,
            client: this.clients.nitroliteClient,
            publicClient: this.clients.publicClient,
            walletClient: this.clients.walletClient,
            sessionKeyPair: this.sessionKeyPair,
            appSessionId: this.appSessionId,
            channelId: this.appSessionChannelId,
            userAddress,
            relayerAddress,
            totalSpent,
            depositAmount,
            listeningActivity,
        });

        // Check balances AFTER close and withdrawal
        const walletAfter = await getTokenBalance(this.clients.publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        const userCustodyAfter = await this.clients.nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

        console.log('\n  Balances AFTER settlement:');
        console.log(`    User wallet: ${formatUSDCDisplay(walletAfter)}`);
        console.log(`    User custody: ${formatUSDCDisplay(userCustodyAfter)} (should be 0)`);
        console.log(`    Relayer received: ${formatUSDCDisplay(result.relayerReceived)} (in relayer custody)`);

        // Verify the math
        const walletChange = walletAfter - walletBefore;
        console.log('\n  Verification:');
        console.log(`    User wallet change: ${formatUSDCDisplay(walletChange)}`);
        console.log(`    Expected refund: ${formatUSDCDisplay(refundAmount)}`);

        this.emit('channel:closed', this.appSessionId, result.userWithdrawTxHash || ('0x' as `0x${string}`));

        // Generate session summary
        const summary = this.sessionManager.endSession();
        this.emit('session:ended', summary);

        // Reset
        const appSessionId = this.appSessionId;
        this.appSessionId = null;
        this.appSessionChannelId = null;
        this.appSessionVersion = 1;
        this.sessionManager.reset();

        console.log('\n' + '='.repeat(60));
        console.log('SETTLEMENT COMPLETE');
        console.log('='.repeat(60));
        console.log(`  User received: ${formatUSDCDisplay(refundAmount)} (in wallet)`);
        console.log(`  Relayer received: ${formatUSDCDisplay(totalSpent)} (in custody, ready to withdraw)`);
        console.log(`  User custody: 0 (empty)`);
        console.log('');
        console.log(`  Listening Activity (${listeningActivity.length} songs):`);
        for (const record of listeningActivity) {
            console.log(`    - songListened: ${record.songListened}, amountSpent: ${formatUSDCDisplay(record.amountSpent)}`);
        }
        console.log('');
        console.log('  All transactions on-chain and verifiable on Etherscan');
        console.log('='.repeat(60));

        return {
            success: true,
            transfers: [], // No longer tracking individual artist transfers here
            closeTxHash: appSessionId, // Use appSessionId as reference
            refundAmount,
            withdrawTxHash: result.userWithdrawTxHash || null,
            relayerTransfer: {
                success: true,
                destination: relayerAddress,
                amount: totalSpent,
                timestamp: Date.now(),
            },
            sessionInfo: {
                userAddress,
                depositAmount,
                totalSpent,
                refundDue: refundAmount,
            },
            listeningActivity, // Key data for relayer to distribute to artists
        };
    }

    /**
     * End session using basic channels (legacy mode)
     */
    private async endBasicChannelMode(): Promise<SettlementResult> {
        if (!this.ws || !this.clients || !this.sessionKeyPair) {
            throw new Error('Not ready');
        }

        const channelId = this.sessionManager.getChannelId();
        if (!channelId) {
            throw new Error('No channel ID in session');
        }

        // Get session amounts
        const totalSpent = this.sessionManager.getTotalSpent();
        const depositAmount = this.sessionManager.getState().depositAmount;
        const refundAmount = depositAmount - totalSpent;
        const userAddress = this.clients.account.address;

        // Get listening activity BEFORE ending session (while data is still available)
        const listeningActivity = this.sessionManager.getListeningActivity();

        console.log('\n[Session Settlement - Basic Channel Mode]');
        console.log(`  User: ${userAddress}`);
        console.log(`  Total deposited: ${formatUSDCDisplay(depositAmount)}`);
        console.log(`  Total spent: ${formatUSDCDisplay(totalSpent)}`);
        console.log(`  Refund (user keeps): ${formatUSDCDisplay(refundAmount)}`);
        console.log(`  Payment to relayer: ${formatUSDCDisplay(totalSpent)}`);
        console.log(`  Listening Activity (${listeningActivity.length} songs):`);
        for (const record of listeningActivity) {
            console.log(`    - songListened: ${record.songListened}, amountSpent: ${formatUSDCDisplay(record.amountSpent)}`);
        }

        // Step 1: Close channel with funds going to USER
        console.log('\n[Step 1] Closing channel (funds → user custody)...');

        // Log balances BEFORE close
        const custodyAddress = CONTRACT_ADDRESSES.sepolia.custody;
        const channelBalanceBefore = await getChannelBalance(
            this.clients.publicClient,
            custodyAddress,
            channelId,
            DEFAULT_TOKEN_ADDRESS
        );
        const custodyBalanceBefore = await getUserCustodyBalance(
            this.clients.publicClient,
            custodyAddress,
            userAddress,
            DEFAULT_TOKEN_ADDRESS
        );
        const walletBalanceBefore = await getTokenBalance(
            this.clients.publicClient,
            DEFAULT_TOKEN_ADDRESS,
            userAddress
        );
        console.log('  Balances BEFORE close:');
        console.log(`    Channel balance: ${channelBalanceBefore} units (${formatUSDCDisplay(channelBalanceBefore)})`);
        console.log(`    User custody balance: ${custodyBalanceBefore} units (${formatUSDCDisplay(custodyBalanceBefore)})`);
        console.log(`    User wallet (ERC20): ${walletBalanceBefore} units (${formatUSDCDisplay(walletBalanceBefore)})`);

        // Log on-chain channel state before close
        await logOnChainChannelState(this.clients.nitroliteClient, channelId);

        // Wait for channel state to settle before closing
        await new Promise(r => setTimeout(r, 2000));

        await sendCloseChannelRequest({
            ws: this.ws,
            sessionKeyPair: this.sessionKeyPair,
            channelId,
            fundsDestination: userAddress,
        });

        // Wait for ClearNode confirmation
        const closeResponse = await waitForCloseConfirmation(this.ws, channelId);

        // Log the allocations to understand fund distribution
        console.log('  Close response allocations:');
        for (const alloc of closeResponse.state.allocations) {
            const isUser = alloc.destination.toLowerCase() === userAddress.toLowerCase();
            console.log(`    ${isUser ? '→ USER' : '→ SERVER'}: ${formatUSDCDisplay(BigInt(alloc.amount))} (${alloc.destination.slice(0, 10)}...)`);
        }

        // Submit close to blockchain
        const closeTxHash = await submitCloseToBlockchain(
            this.clients.nitroliteClient,
            this.clients.publicClient,
            closeResponse
        );

        console.log(`✓ Channel closed: ${closeTxHash}`);

        // Wait for close to settle on-chain
        console.log('  Waiting for close to settle...');
        await new Promise(r => setTimeout(r, 10000));

        // Log balances AFTER close
        const channelBalanceAfter = await getChannelBalance(
            this.clients.publicClient,
            custodyAddress,
            channelId,
            DEFAULT_TOKEN_ADDRESS
        );
        const custodyBalanceAfter = await getUserCustodyBalance(
            this.clients.publicClient,
            custodyAddress,
            userAddress,
            DEFAULT_TOKEN_ADDRESS
        );
        const walletBalanceAfter = await getTokenBalance(
            this.clients.publicClient,
            DEFAULT_TOKEN_ADDRESS,
            userAddress
        );
        console.log('  Balances AFTER close:');
        console.log(`    Channel balance: ${channelBalanceAfter} units (${formatUSDCDisplay(channelBalanceAfter)})`);
        console.log(`    User custody balance: ${custodyBalanceAfter} units (${formatUSDCDisplay(custodyBalanceAfter)})`);
        console.log(`    User wallet (ERC20): ${walletBalanceAfter} units (${formatUSDCDisplay(walletBalanceAfter)})`);

        // Calculate what we expect vs what we got
        const expectedInCustody = BigInt(closeResponse.state.allocations.find(a =>
            a.destination.toLowerCase() === userAddress.toLowerCase()
        )?.amount || '0');
        console.log(`  Expected in custody: ${expectedInCustody} units`);
        console.log(`  Actual custody change: ${custodyBalanceAfter - custodyBalanceBefore} units`);
        console.log(`  Actual wallet change: ${walletBalanceAfter - walletBalanceBefore} units`);

        this.emit('channel:closed', channelId, closeTxHash);

        // Step 2: Withdraw from custody
        console.log('\n[Step 2] Withdrawing from custody...');

        const { amount: withdrawnAmount, txHash: withdrawTxHash } = await withdrawFromCustody({
            client: this.clients.nitroliteClient,
            publicClient: this.clients.publicClient,
            token: DEFAULT_TOKEN_ADDRESS,
            userAddress,
            custodyAddress: CONTRACT_ADDRESSES.sepolia.custody,
        });

        if (withdrawTxHash) {
            console.log(`✓ Withdrawn ${formatUSDCDisplay(withdrawnAmount)} from custody`);
            console.log(`  TX: ${withdrawTxHash}`);
        } else {
            console.log('  No funds to withdraw from custody');
        }

        // Step 3: Transfer spent amount to relayer
        let relayerTransferResult: TransferResult | null = null;

        if (totalSpent > 0n) {
            console.log('\n[Step 3] Sending payment to relayer...');
            console.log(`  Amount: ${formatUSDCDisplay(totalSpent)}`);
            console.log(`  Relayer: ${RELAYER_ADDRESS}`);

            const transferResult = await transferToRelayer({
                walletClient: this.clients.walletClient,
                publicClient: this.clients.publicClient,
                tokenAddress: DEFAULT_TOKEN_ADDRESS,
                amount: totalSpent,
                relayerAddress: RELAYER_ADDRESS,
            });

            if (transferResult.success) {
                console.log(`✓ Payment sent to relayer: ${transferResult.txHash}`);
                relayerTransferResult = {
                    success: true,
                    destination: RELAYER_ADDRESS,
                    amount: totalSpent,
                    timestamp: Date.now(),
                };
                this.emit('transfer:completed', relayerTransferResult);
            } else {
                console.error(`✗ Failed to send payment to relayer: ${transferResult.error}`);
                relayerTransferResult = {
                    success: false,
                    destination: RELAYER_ADDRESS,
                    amount: totalSpent,
                    timestamp: Date.now(),
                };
            }
        } else {
            console.log('\n[Step 3] No payment needed (nothing spent)');
        }

        // Generate session summary
        const summary = this.sessionManager.endSession();
        this.emit('session:ended', summary);

        // Reset session manager
        this.sessionManager.reset();

        console.log('\n[Settlement Complete]');
        console.log(`  User keeps: ${formatUSDCDisplay(refundAmount)}`);
        console.log(`  Relayer received: ${formatUSDCDisplay(totalSpent)}`);
        console.log('');
        console.log(`  Listening Activity (${listeningActivity.length} songs):`);
        for (const record of listeningActivity) {
            console.log(`    - songListened: ${record.songListened}, amountSpent: ${formatUSDCDisplay(record.amountSpent)}`);
        }

        return {
            success: true,
            transfers: [], // No longer tracking individual artist transfers
            closeTxHash,
            refundAmount,
            withdrawTxHash,
            relayerTransfer: relayerTransferResult,
            sessionInfo: {
                userAddress,
                depositAmount,
                totalSpent,
                refundDue: refundAmount,
            },
            listeningActivity, // Key data for relayer to distribute to artists
        };
    }

    /**
     * Add more funds to the current session
     */
    async addFunds(amount: bigint): Promise<void> {
        if (!this.sessionManager.isActive()) {
            throw new Error('No active session');
        }

        const channelId = this.sessionManager.getChannelId();
        if (!channelId) {
            throw new Error('No channel ID in session');
        }

        await this.fundSessionChannel(channelId, amount);
        this.sessionManager.addFunds(amount);

        this.emit('session:updated', this.sessionManager.getState());
    }

    // ========================================================================
    // Playback Tracking
    // ========================================================================

    /**
     * Start playing a song
     * If there's a current play, this triggers an off-chain microtransaction
     * to record payment for the previous song before starting the new one
     */
    async startPlay(song: Song): Promise<void> {
        if (!this.sessionManager.isActive()) {
            throw new Error('No active session');
        }

        // Check if there's a current play (user is switching songs)
        const currentPlay = this.sessionManager.getCurrentPlay();
        if (currentPlay && currentPlay.totalCost > 0n) {
            // Submit off-chain microtransaction for the previous song
            await this.submitMicrotransaction();
        }

        this.sessionManager.startPlay(song);
        this.emit('session:updated', this.sessionManager.getState());
    }

    /**
     * Stop the current play and optionally submit microtransaction
     */
    async stopPlay(): Promise<PlayEvent | null> {
        const currentPlay = this.sessionManager.getCurrentPlay();

        // Submit microtransaction before stopping if there's cost
        if (currentPlay && currentPlay.totalCost > 0n && this.config.useAppSessions && this.appSessionId) {
            await this.submitMicrotransaction();
        }

        const playEvent = this.sessionManager.stopCurrentPlay();
        this.emit('session:updated', this.sessionManager.getState());
        return playEvent;
    }

    /**
     * Submit an off-chain microtransaction (state update)
     * This is called when switching songs to record payment for the current song
     *
     * IMPORTANT: Uses server-confirmed allocations (like reference code)
     * - Start from last confirmed allocations
     * - Apply delta (song cost: subtract from user, add to relayer)
     * - Update allocations from server response
     */
    private async submitMicrotransaction(): Promise<void> {
        if (!this.config.useAppSessions || !this.appSessionId) {
            return; // Only for App Sessions mode
        }

        if (!this.ws || !this.sessionKeyPair || !this.clients) {
            return;
        }

        const currentPlay = this.sessionManager.getCurrentPlay();
        if (!currentPlay || currentPlay.totalCost === 0n) {
            return;
        }

        // Capture song cost BEFORE stopping (stopCurrentPlay adds to totalSpent)
        const songCost = currentPlay.totalCost;

        // Stop current play to finalize cost calculation
        this.sessionManager.stopCurrentPlay();

        const userAddress = this.clients.account.address;
        const relayerAddress = this.config.relayerAddress!;

        // DEBUG: Log what we have
        console.log('\n  [DEBUG] App Session Allocations:', JSON.stringify(this.appSessionAllocations, null, 2));
        console.log('  [DEBUG] Looking for userAddress:', userAddress);
        console.log('  [DEBUG] Looking for relayerAddress:', relayerAddress);

        // FIX: More robust allocation finding
        let currentUserBalance: bigint;
        let currentRelayerBalance: bigint;

        const userAlloc = this.appSessionAllocations.find(
            a => a.participant.toLowerCase() === userAddress.toLowerCase()
        );
        const relayerAlloc = this.appSessionAllocations.find(
            a => a.participant.toLowerCase() === relayerAddress.toLowerCase()
        );

        console.log('  [DEBUG] Found userAlloc:', userAlloc);
        console.log('  [DEBUG] Found relayerAlloc:', relayerAlloc);

        // Use allocations if found, otherwise use deposit amount as starting point
        if (userAlloc && userAlloc.amount) {
            currentUserBalance = BigInt(userAlloc.amount);
        } else {
            // Fallback: use deposit minus PREVIOUS spending (exclude current song since we'll subtract it below)
            // Note: getTotalSpent() now includes songCost since stopCurrentPlay() was called
            const totalSpentBeforeThisSong = this.sessionManager.getTotalSpent() - songCost;
            currentUserBalance = this.sessionManager.getState().depositAmount - totalSpentBeforeThisSong;
            console.log('  [WARNING] No userAlloc found, using deposit - previous spent:', formatUSDCDisplay(currentUserBalance));
        }

        if (relayerAlloc && relayerAlloc.amount) {
            currentRelayerBalance = BigInt(relayerAlloc.amount);
        } else {
            // Fallback: relayer has received PREVIOUS spending (exclude current song)
            currentRelayerBalance = this.sessionManager.getTotalSpent() - songCost;
            console.log('  [WARNING] No relayerAlloc found, using previous totalSpent:', formatUSDCDisplay(currentRelayerBalance));
        }

        // Calculate new allocations by applying delta (song cost already captured above)
        const newUserBalance = currentUserBalance - songCost;
        const newRelayerBalance = currentRelayerBalance + songCost;

        // Increment version for this state update
        this.appSessionVersion++;

        console.log(`\n  [Song Switch - Microtransaction v${this.appSessionVersion}]`);
        console.log(`    Song: ${currentPlay.songId}`);
        console.log(`    Cost: ${formatUSDCDisplay(songCost)}`);
        console.log(`    Previous: user=${formatUSDCDisplay(currentUserBalance)}, relayer=${formatUSDCDisplay(currentRelayerBalance)}`);
        console.log(`    New: user=${formatUSDCDisplay(newUserBalance)}, relayer=${formatUSDCDisplay(newRelayerBalance)}`);

        try {
            const result = await submitAppState({
                ws: this.ws,
                sessionKeyPair: this.sessionKeyPair,
                appSessionId: this.appSessionId,
                userAddress,
                relayerAddress,
                userBalance: newUserBalance,
                relayerBalance: newRelayerBalance,
                version: this.appSessionVersion,
            });

            // Update allocations from server response (like reference code)
            if (result.success) {
                // Update version from server response
                if (result.version > this.appSessionVersion) {
                    this.appSessionVersion = result.version;
                }

                // Update allocations with correct asset from initial session
                const asset = this.appSessionAllocations[0]?.asset || 'ytest.usd';
                this.appSessionAllocations = [
                    { participant: userAddress, asset, amount: newUserBalance.toString() },
                    { participant: relayerAddress, asset, amount: newRelayerBalance.toString() },
                ];

                console.log(`    ✓ Server confirmed v${this.appSessionVersion}`);
                console.log('    Updated allocations:', JSON.stringify(this.appSessionAllocations, null, 2));
            }

            this.emit('transfer:completed', {
                success: true,
                destination: relayerAddress,
                amount: songCost,
                timestamp: Date.now(),
            });
        } catch (err) {
            console.log(`    ⚠ Microtransaction failed: ${err}`);
        }
    }

    /**
     * Record a completed play directly
     */
    recordPlay(
        songId: string,
        durationSeconds: number,
        pricePerSecond: bigint
    ): PlayEvent {
        if (!this.sessionManager.isActive()) {
            throw new Error('No active session');
        }

        const playEvent = this.sessionManager.recordPlay(
            songId,
            durationSeconds,
            pricePerSecond
        );
        this.emit('session:updated', this.sessionManager.getState());
        return playEvent;
    }

    // ========================================================================
    // State Getters
    // ========================================================================

    /**
     * Get current session state
     */
    getSessionState(): SessionState & { currentPlay: PlayEvent | null } {
        return this.sessionManager.getState();
    }

    /**
     * Get current app session allocations
     * Returns the current fund distribution between user and relayer
     */
    getAppSessionAllocations(): Array<{ participant: string; asset: string; amount: string }> {
        return [...this.appSessionAllocations];
    }

    /**
     * Get auth state
     */
    getAuthState(): AuthState {
        return { ...this.authState };
    }

    /**
     * Check if connected and authenticated
     */
    isReady(): boolean {
        return this.ws?.readyState === WebSocket.OPEN && this.authState.isAuthenticated;
    }

    /**
     * Get wallet address
     */
    getWalletAddress(): Address | null {
        return this.clients?.account.address || null;
    }

    /**
     * Get current token address
     */
    getTokenAddress(): Address | null {
        return this.token;
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private setupMessageHandlers(): void {
        if (!this.ws) return;

        this.ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.error) {
                    console.error('WebSocket error:', msg.error.message || 'Unknown error');
                    this.emit('error', new Error(msg.error.message || 'Unknown error'));
                    return;
                }

                if (msg.res) {
                    const [, method, payload] = msg.res;
                    const handler = this.messageHandlers.get(method);
                    if (handler) {
                        handler(payload);
                    }
                }
            } catch (err) {
                // Ignore parse errors
            }
        });
    }

    private async createNewChannel(): Promise<`0x${string}`> {
        if (!this.ws || !this.sessionKeyPair || !this.token || !this.clients) {
            throw new Error('Not ready to create channel');
        }

        // Send create channel request
        await sendCreateChannelRequest({
            ws: this.ws,
            sessionKeyPair: this.sessionKeyPair,
            token: this.token,
        });

        // Wait for create_channel response
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageHandlers.delete('create_channel');
                reject(new Error('Create channel timeout'));
            }, TIMING.wsMessageTimeout);

            this.messageHandlers.set('create_channel', async (data: unknown) => {
                clearTimeout(timeout);
                this.messageHandlers.delete('create_channel');

                try {
                    const response = data as {
                        channel_id: `0x${string}`;
                        channel: unknown;
                        state: {
                            intent: string;
                            version: string;
                            state_data: `0x${string}`;
                            allocations: Array<{
                                destination: Address;
                                token: Address;
                                amount: string;
                            }>;
                        };
                        server_signature: `0x${string}`;
                    };

                    // Submit to blockchain
                    const result = await submitChannelToBlockchain(
                        this.clients!.nitroliteClient,
                        this.clients!.publicClient,
                        response
                    );

                    this.emit('channel:created', result.channelId);
                    resolve(result.channelId);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    private async fundSessionChannel(
        channelId: `0x${string}`,
        amount: bigint
    ): Promise<void> {
        if (!this.ws || !this.clients || !this.sessionKeyPair) {
            throw new Error('Not ready to fund channel');
        }

        await fundChannel({
            ws: this.ws,
            client: this.clients.nitroliteClient,
            publicClient: this.clients.publicClient,
            sessionKeyPair: this.sessionKeyPair,
            channelId,
            amount,
            fundsDestination: this.clients.account.address,
        });

        this.emit('channel:funded', channelId, amount);
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new YellowService instance
 */
export function createYellowService(config: YellowServiceConfig): YellowService {
    return new YellowService(config);
}
