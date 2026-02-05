import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { Address, Hash } from 'viem';

import type {
    ClearNodeConfig,
    AuthState,
    SessionState,
    SessionSummary,
    Song,
    PlayEvent,
    TransferResult,
    SettlementResult,
    YellowServiceEvents,
    Channel,
} from './types';

import {
    CLEARNODE_URLS,
    CONTRACT_ADDRESSES,
    SESSION_CONFIG,
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
    requestLedgerBalances,
    findOpenChannel,
    getTokenFromConfig,
    sendCreateChannelRequest,
    submitChannelToBlockchain,
    waitForChannelIndexing,
    getChannelBalance,
} from './channels/create';

import { fundChannel } from './channels/resize';
import { closeChannelAndWithdraw } from './channels/close';
import { transferAndConfirm } from './channels/transfer';
import { transferToRelayer } from './channels/relayer';
import { formatUSDCDisplay, RELAYER_ADDRESS } from './config';

import { SessionManager } from './session/SessionManager';

// ============================================================================
// Yellow Service
// ============================================================================

export interface YellowServiceConfig {
    privateKey: `0x${string}`;
    environment?: 'sandbox' | 'production';
    rpcUrl?: string;
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

    constructor(config: YellowServiceConfig) {
        super();
        this.config = config;
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
     */
    async startSession(depositAmount: bigint): Promise<SessionState> {
        if (!this.ws || !this.authState.isAuthenticated || !this.clients || !this.sessionKeyPair) {
            throw new Error('Not connected or authenticated');
        }

        this.sessionManager.setStatus('starting');

        // Request ledger balances to get channels
        await requestLedgerBalances(
            this.ws,
            this.sessionKeyPair,
            this.clients.account.address
        );

        // Wait for channels response
        const channels = await this.waitForChannels();
        const existingChannel = findOpenChannel(channels);

        let channelId: `0x${string}`;

        if (existingChannel) {
            // Use existing channel
            channelId = existingChannel.channel_id;
            console.log('Using existing channel:', channelId);
        } else {
            // Create new channel
            channelId = await this.createNewChannel();
            console.log('Created new channel:', channelId);
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
     * Flow:
     * 1. Transfer spent amount to relayer (off-chain via Yellow ledger)
     * 2. Close Yellow channel
     * 3. Withdraw remaining funds from custody to user's wallet
     * 4. Relayer handles cross-chain distribution to artists via Circle CCTP
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

        const channelId = this.sessionManager.getChannelId();
        if (!channelId) {
            throw new Error('No channel ID in session');
        }

        // Get total spent amount for relayer transfer
        const totalSpent = this.sessionManager.getTotalSpent();
        const artistTotals = this.sessionManager.getArtistTotals();

        console.log('\n[Session Settlement]');
        console.log(`  Total spent: ${formatUSDCDisplay(totalSpent)}`);
        console.log(`  Artists to pay: ${artistTotals.size}`);
        for (const [address, amount] of artistTotals) {
            console.log(`    - ${address}: ${formatUSDCDisplay(amount)}`);
        }

        // Step 1: Transfer spent amount to relayer (off-chain via Yellow)
        let relayerTransferResult: TransferResult | null = null;

        if (totalSpent > 0n) {
            console.log('\n[Step 1] Transferring spent amount to relayer (off-chain)...');
            console.log(`  Relayer: ${RELAYER_ADDRESS}`);
            console.log(`  Amount: ${formatUSDCDisplay(totalSpent)}`);

            try {
                const transferResult = await transferAndConfirm({
                    ws: this.ws,
                    sessionKeyPair: this.sessionKeyPair,
                    destination: RELAYER_ADDRESS,
                    asset: 'ytest.usd',
                    amount: totalSpent.toString(),
                });

                relayerTransferResult = {
                    success: transferResult.success,
                    destination: RELAYER_ADDRESS,
                    amount: totalSpent,
                    timestamp: Date.now(),
                };

                console.log(`✓ Transferred ${formatUSDCDisplay(totalSpent)} to relayer`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                console.error(`✗ Relayer transfer failed: ${errorMsg}`);

                relayerTransferResult = {
                    success: false,
                    destination: RELAYER_ADDRESS,
                    amount: totalSpent,
                    timestamp: Date.now(),
                };
            }
        } else {
            console.log('\n[Step 1] No spent amount to transfer to relayer');
        }

        // Step 2: Close channel
        console.log('\n[Step 2] Closing channel...');
        const closeResult = await closeChannelAndWithdraw({
            ws: this.ws,
            client: this.clients.nitroliteClient,
            publicClient: this.clients.publicClient,
            sessionKeyPair: this.sessionKeyPair,
            channelId,
            fundsDestination: this.clients.account.address,
            token: this.token,
            custodyAddress: CONTRACT_ADDRESSES.sepolia.custody,
        });
        console.log(`✓ Channel closed: ${closeResult.closeTxHash}`);

        // Step 3: Withdrawal happens automatically in closeChannelAndWithdraw
        if (closeResult.withdrawTxHash) {
            console.log(`✓ Funds withdrawn: ${closeResult.withdrawTxHash}`);
        }

        // Step 4: If off-chain transfer failed, try on-chain transfer as fallback
        if (totalSpent > 0n && !relayerTransferResult?.success) {
            console.log('\n[Step 3] Off-chain transfer failed, trying on-chain transfer...');

            // Wait for withdrawal to settle
            await new Promise((r) => setTimeout(r, TIMING.closeSettleDelay));

            const onChainResult = await transferToRelayer({
                walletClient: this.clients.walletClient,
                publicClient: this.clients.publicClient,
                tokenAddress: this.token,
                amount: totalSpent,
            });

            relayerTransferResult = {
                success: onChainResult.success,
                destination: RELAYER_ADDRESS,
                amount: totalSpent,
                timestamp: Date.now(),
            };

            if (onChainResult.success) {
                console.log(`✓ On-chain transfer successful: ${onChainResult.txHash}`);
            } else {
                console.error(`✗ On-chain transfer also failed: ${onChainResult.error}`);
            }
        }

        // Build transfer results (for reporting artist distributions)
        const transfers: TransferResult[] = [];
        for (const [address, amount] of artistTotals) {
            transfers.push({
                success: relayerTransferResult?.success ?? false,
                destination: address,
                amount,
                timestamp: Date.now(),
            });
        }

        // Generate session summary
        const summary = this.sessionManager.endSession();
        this.emit('session:ended', summary);

        // Reset session manager
        this.sessionManager.reset();

        return {
            success: true,
            transfers,
            closeTxHash: closeResult.closeTxHash,
            refundAmount: closeResult.withdrawAmount,
            withdrawTxHash: closeResult.withdrawTxHash,
            relayerTransfer: relayerTransferResult,
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
     */
    startPlay(song: Song): void {
        if (!this.sessionManager.isActive()) {
            throw new Error('No active session');
        }

        this.sessionManager.startPlay(song);
        this.emit('session:updated', this.sessionManager.getState());
    }

    /**
     * Stop the current play
     */
    stopPlay(): PlayEvent | null {
        const playEvent = this.sessionManager.stopCurrentPlay();
        this.emit('session:updated', this.sessionManager.getState());
        return playEvent;
    }

    /**
     * Record a completed play directly
     */
    recordPlay(
        songId: string,
        artistAddress: Address,
        durationSeconds: number,
        pricePerSecond: bigint
    ): PlayEvent {
        if (!this.sessionManager.isActive()) {
            throw new Error('No active session');
        }

        const playEvent = this.sessionManager.recordPlay(
            songId,
            artistAddress,
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
                    console.error('WebSocket error:', msg.error);
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

    private async waitForChannels(): Promise<Channel[]> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageHandlers.delete('channels');
                reject(new Error('Channels request timeout'));
            }, TIMING.wsMessageTimeout);

            this.messageHandlers.set('channels', (data: unknown) => {
                clearTimeout(timeout);
                this.messageHandlers.delete('channels');
                const response = data as { channels: Channel[] };
                resolve(response.channels || []);
            });
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

        const result = await fundChannel({
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
