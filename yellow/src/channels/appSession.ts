import {
    createAppSessionMessage,
    createCloseAppSessionMessage,
    createSubmitAppStateMessage,
    createTransferMessage,
    createCreateChannelMessage,
    NitroliteClient,
    RPCProtocolVersion,
    RPCAppStateIntent,
} from '@erc7824/nitrolite';
import { type PublicClient, type Address, type Hash, type WalletClient } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { CloseAppSessionResponse, CreateChannelResponse, ListeningActivity } from '../types';
import { TIMING, formatUSDCDisplay, DEFAULT_TOKEN_ADDRESS, SESSION_CONFIG, SEPOLIA_CHAIN_ID } from '../config';
import { depositToCustody, fundChannel } from './resize';
import { submitChannelToBlockchain, waitForChannelIndexing } from './create';
import { sendCloseChannelRequest, waitForCloseConfirmation, submitCloseToBlockchain } from './close';
import { getTokenBalance } from './relayer';
import { performRelayerWithdrawal } from './relayerWithdraw';

// ============================================================================
// App Session Creation
// ============================================================================

export interface CreateAppSessionParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    userAddress: Address;
    relayerAddress: Address;
    depositAmount: bigint;
    tokenSymbol?: string;
}

/**
 * Create an App Session between user and relayer
 * User deposits their funds, relayer starts with 0
 * Returns server-confirmed session ID, version, and allocations
 */
export async function createAppSession(
    params: CreateAppSessionParams
): Promise<CreateAppSessionResult> {
    const {
        ws,
        sessionKeyPair,
        userAddress,
        relayerAddress,
        depositAmount,
        tokenSymbol = 'ytest.usd',
    } = params;

    console.log('  Creating App Session...');
    console.log(`    User: ${userAddress}`);
    console.log(`    Relayer: ${relayerAddress}`);
    console.log(`    User deposit: ${formatUSDCDisplay(depositAmount)}`);

    // Create app session message
    // IMPORTANT: Use weights [100, 0] and quorum 100 for single-signer mode
    // This allows the user to sign state updates without needing relayer's signature
    // The relayer is passive and doesn't need to actively sign
    const appDefinition = {
        application: SESSION_CONFIG.applicationName,
        protocol: RPCProtocolVersion.NitroRPC_0_4,
        participants: [userAddress, relayerAddress],
        weights: [100, 0],  // User has full weight, relayer has none
        quorum: 100,        // Only user's signature needed
        challenge: 0,       // No challenge period for instant updates
        nonce: Date.now(),  // Unique nonce for this session
    };

    const appAllocations = [
        {
            participant: userAddress,
            asset: tokenSymbol,
            amount: depositAmount.toString(),
        },
        {
            participant: relayerAddress,
            asset: tokenSymbol,
            amount: '0',
        },
    ];

    const appSessionMsg = await createAppSessionMessage(
        sessionKeyPair.signer,
        {
            definition: appDefinition,
            allocations: appAllocations,
        }
    );

    ws.send(appSessionMsg);
    console.log('  App Session request sent');

    return waitForAppSessionCreation(ws);
}

/** Result from creating an App Session */
export interface CreateAppSessionResult {
    appSessionId: `0x${string}`;
    version: number;
    allocations: Array<{ participant: string; asset: string; amount: string }>;
}

/**
 * Wait for App Session creation confirmation
 * Returns the full server response including allocations (like reference code)
 */
function waitForAppSessionCreation(
    ws: WebSocket,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<CreateAppSessionResult> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Create App Session timeout'));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());

                // Check for error response: msg.res[1] === 'error'
                if (msg.res && msg.res[1] === 'error') {
                    const errorPayload = msg.res[2];
                    const errorMsg = errorPayload?.error || JSON.stringify(errorPayload);
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(errorMsg));
                    return;
                }

                if (msg.res && msg.res[1] === 'create_app_session') {
                    const payload = msg.res[2];

                    // Handle both array and object response formats
                    const sessionData = Array.isArray(payload) ? payload[0] : payload;
                    const sessionId = sessionData?.app_session_id || sessionData?.sessionId;

                    clearTimeout(timeout);
                    ws.off('message', handler);
                    console.log(`  ✓ App Session created: ${sessionId}`);
                    console.log(`    Version: ${sessionData?.version || 1}`);

                    resolve({
                        appSessionId: sessionId,
                        version: sessionData?.version || 1,
                        allocations: sessionData?.allocations || [],
                    });
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || JSON.stringify(msg.error) || 'Create App Session error'));
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        ws.on('message', handler);
    });
}

// ============================================================================
// App Session State Updates (Off-chain Microtransactions)
// ============================================================================

export interface SubmitAppStateParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    appSessionId: `0x${string}`;
    userAddress: Address;
    relayerAddress: Address;
    userBalance: bigint;
    relayerBalance: bigint;
    version: number;
    tokenSymbol?: string;
}

export interface AppStateUpdateResult {
    success: boolean;
    version: number;
    userBalance: bigint;
    relayerBalance: bigint;
}

/**
 * Submit an app state update (off-chain microtransaction)
 * Used when user switches songs to record the payment for the previous song
 * This is instant and off-chain - no gas needed!
 */
export async function submitAppState(
    params: SubmitAppStateParams
): Promise<AppStateUpdateResult> {
    const {
        ws,
        sessionKeyPair,
        appSessionId,
        userAddress,
        relayerAddress,
        userBalance,
        relayerBalance,
        version,
        tokenSymbol = 'ytest.usd',
    } = params;

    console.log(`  [Microtransaction] State update v${version}`);
    console.log(`    User balance: ${formatUSDCDisplay(userBalance)}`);
    console.log(`    Relayer balance: ${formatUSDCDisplay(relayerBalance)}`);

    // Create submit app state message
    const stateMsg = await createSubmitAppStateMessage(
        sessionKeyPair.signer,
        {
            app_session_id: appSessionId,
            allocations: [
                {
                    participant: userAddress,
                    asset: tokenSymbol,
                    amount: userBalance.toString(),
                },
                {
                    participant: relayerAddress,
                    asset: tokenSymbol,
                    amount: relayerBalance.toString(),
                },
            ],
            intent: RPCAppStateIntent.Operate,
            version: version,
        }
    );

    ws.send(stateMsg);

    return waitForAppStateUpdate(ws, appSessionId, version);
}

/**
 * Wait for app state update confirmation
 */
function waitForAppStateUpdate(
    ws: WebSocket,
    appSessionId: `0x${string}`,
    expectedVersion: number,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<AppStateUpdateResult> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            // Don't reject on timeout - state updates may be silent
            resolve({
                success: true,
                version: expectedVersion,
                userBalance: 0n,
                relayerBalance: 0n,
            });
        }, 5000); // Short timeout for state updates

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                // Check for error response first (critical: msg.res[1] === 'error')
                if (msg.res && msg.res[1] === 'error') {
                    const errorPayload = msg.res[2];
                    const errorMsg = errorPayload?.error || JSON.stringify(errorPayload);
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    console.log(`  ⚠ State update error: ${errorMsg}`);
                    resolve({
                        success: false,
                        version: expectedVersion,
                        userBalance: 0n,
                        relayerBalance: 0n,
                    });
                    return;
                }
                if (msg.res && msg.res[1] === 'submit_app_state') {
                    const payload = msg.res[2];
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    console.log(`  ✓ State update confirmed (v${payload?.version || expectedVersion})`);
                    resolve({
                        success: true,
                        version: payload?.version || expectedVersion,
                        userBalance: BigInt(payload?.allocations?.[0]?.amount || '0'),
                        relayerBalance: BigInt(payload?.allocations?.[1]?.amount || '0'),
                    });
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    console.log(`  ⚠ State update error: ${msg.error.message}`);
                    resolve({
                        success: false,
                        version: expectedVersion,
                        userBalance: 0n,
                        relayerBalance: 0n,
                    });
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        ws.on('message', handler);
    });
}

// ============================================================================
// App Session Close with Fund Distribution
// ============================================================================

export interface CloseAppSessionParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    appSessionId: `0x${string}`;
    userAddress: Address;
    relayerAddress: Address;
    userAmount: bigint;
    relayerAmount: bigint;
    tokenSymbol?: string;
}

/**
 * Close App Session with explicit fund distribution
 * This is the key function that splits funds between user and relayer
 */
export async function closeAppSession(
    params: CloseAppSessionParams
): Promise<CloseAppSessionResponse> {
    const {
        ws,
        sessionKeyPair,
        appSessionId,
        userAddress,
        relayerAddress,
        userAmount,
        relayerAmount,
        tokenSymbol = 'ytest.usd',
    } = params;

    console.log('  Closing App Session with fund distribution...');
    console.log(`    Session ID: ${appSessionId}`);
    console.log(`    User receives: ${formatUSDCDisplay(userAmount)}`);
    console.log(`    Relayer receives: ${formatUSDCDisplay(relayerAmount)}`);

    // Create close app session message with final allocations
    const closeMsg = await createCloseAppSessionMessage(
        sessionKeyPair.signer,
        {
            app_session_id: appSessionId,
            allocations: [
                {
                    participant: userAddress,
                    asset: tokenSymbol,
                    amount: userAmount.toString(),
                },
                {
                    participant: relayerAddress,
                    asset: tokenSymbol,
                    amount: relayerAmount.toString(),
                },
            ],
        }
    );

    // Check WebSocket is still connected before sending
    if (ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket not open (state: ${ws.readyState}). Connection may have dropped during session.`);
    }

    ws.send(closeMsg);
    console.log('  Close App Session request sent');
    console.log(`  WebSocket readyState: ${ws.readyState} (1=OPEN)`);

    return waitForAppSessionClose(ws, appSessionId);
}

/**
 * Wait for App Session close confirmation
 */
function waitForAppSessionClose(
    ws: WebSocket,
    appSessionId: `0x${string}`,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<CloseAppSessionResponse> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            ws.off('message', handler);
            ws.off('close', closeHandler);
            ws.off('error', errorHandler);
        };

        const timeout = setTimeout(() => {
            cleanup();
            console.log('  ✗ Close App Session timeout - no matching response received');
            console.log(`  WebSocket readyState at timeout: ${ws.readyState} (1=OPEN)`);
            reject(new Error('Close App Session timeout'));
        }, timeoutMs);

        const closeHandler = (code: number, reason: Buffer) => {
            clearTimeout(timeout);
            cleanup();
            reject(new Error(`WebSocket closed during close_app_session (code: ${code}, reason: ${reason?.toString() || 'none'})`));
        };

        const errorHandler = (err: Error) => {
            clearTimeout(timeout);
            cleanup();
            reject(new Error(`WebSocket error during close_app_session: ${err.message}`));
        };

        ws.on('close', closeHandler);
        ws.on('error', errorHandler);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());

                // Debug: log all received messages during close
                console.log('  [DEBUG] Received message during close:', JSON.stringify(msg, null, 2).substring(0, 500));

                // Check for error response first (critical: msg.res[1] === 'error')
                if (msg.res && msg.res[1] === 'error') {
                    const errorPayload = msg.res[2];
                    const errorMsg = errorPayload?.error || JSON.stringify(errorPayload);
                    clearTimeout(timeout);
                    cleanup();
                    console.log('  ✗ Close App Session error:', errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }

                // Check for close_app_session response
                if (msg.res && msg.res[1] === 'close_app_session') {
                    const payload = msg.res[2] as CloseAppSessionResponse;
                    if (payload.app_session_id === appSessionId) {
                        clearTimeout(timeout);
                        cleanup();
                        console.log('  ✓ App Session closed');
                        resolve(payload);
                    }
                }

                // Also check for 'closed' response type (alternate response format)
                if (msg.res && (msg.res[1] === 'closed' || msg.res[1] === 'app_session_closed')) {
                    const payload = msg.res[2] as CloseAppSessionResponse;
                    const sessionId = payload.app_session_id || (payload as any).session_id;
                    if (sessionId === appSessionId) {
                        clearTimeout(timeout);
                        cleanup();
                        console.log('  ✓ App Session closed (alternate response)');
                        resolve(payload);
                    }
                }

                if (msg.error) {
                    clearTimeout(timeout);
                    cleanup();
                    reject(new Error(msg.error.message || 'Close App Session error'));
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        ws.on('message', handler);
    });
}

// ============================================================================
// Combined Flow: Start Session with Deposit
// ============================================================================

export interface StartAppSessionParams {
    ws: WebSocket;
    client: NitroliteClient;
    publicClient: PublicClient;
    sessionKeyPair: SessionKeyPair;
    userAddress: Address;
    relayerAddress: Address;
    depositAmount: bigint;
    tokenSymbol?: string;
}

/** Result from starting an App Session */
export interface StartAppSessionResult {
    appSessionId: `0x${string}`;
    channelId: `0x${string}`;
    depositTxHash: Hash;
    version: number;
    allocations: Array<{ participant: string; asset: string; amount: string }>;
}

/**
 * Start an App Session with the full correct Yellow Network workflow:
 * 1. Deposit to custody (on-chain: wallet → available balance)
 * 2. Create channel (on-chain: register with clearnode)
 * 3. Resize/fund channel (on-chain: available → channel-locked → unified balance)
 * 4. Create App Session (off-chain: unified balance → app session)
 */
export async function startAppSession(
    params: StartAppSessionParams
): Promise<StartAppSessionResult> {
    const {
        ws,
        client,
        publicClient,
        sessionKeyPair,
        userAddress,
        relayerAddress,
        depositAmount,
        tokenSymbol = 'ytest.usd',
    } = params;

    console.log('\n[Starting App Session]');
    console.log(`  User: ${userAddress}`);
    console.log(`  Relayer: ${relayerAddress}`);
    console.log(`  Deposit: ${formatUSDCDisplay(depositAmount)}`);

    // ── Step 0: Check for and close any existing open channels ──
    console.log('\n  [Step 0] Checking for existing open channels...');
    try {
        const existingChannels = await client.getOpenChannels();
        if (existingChannels.length > 0) {
            console.log(`    Found ${existingChannels.length} existing open channel(s)`);
            for (const existingChannelId of existingChannels) {
                console.log(`    Closing existing channel: ${existingChannelId}`);
                try {
                    // Send close channel request via WebSocket
                    await sendCloseChannelRequest({
                        ws,
                        sessionKeyPair,
                        channelId: existingChannelId,
                        fundsDestination: userAddress,
                    });

                    // Wait for ClearNode confirmation
                    const closeResponse = await waitForCloseConfirmation(ws, existingChannelId, 30000);

                    // Submit close to blockchain
                    await submitCloseToBlockchain(client, publicClient, closeResponse, 3);
                    console.log(`    ✓ Closed existing channel: ${existingChannelId}`);

                    // Wait a moment for state to settle
                    await new Promise(r => setTimeout(r, 2000));
                } catch (closeErr) {
                    console.log(`    ⚠ Could not close channel ${existingChannelId}: ${closeErr}`);
                    // Continue anyway - maybe the channel is already marked closed on clearnode
                }
            }
        } else {
            console.log('    No existing open channels found');
        }
    } catch (err) {
        console.log(`    ⚠ Could not check for open channels: ${err}`);
    }

    // ── Step 1: Deposit to custody (on-chain: wallet → available balance) ──
    console.log('\n  [Step 1] Deposit to custody (on-chain)...');
    const walletBalance = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
    console.log(`    Wallet balance: ${formatUSDCDisplay(walletBalance)}`);

    if (walletBalance < depositAmount) {
        throw new Error(
            `Insufficient wallet funds. Need ${formatUSDCDisplay(depositAmount)} but wallet only has ` +
            `${formatUSDCDisplay(walletBalance)}.`
        );
    }

    console.log(`    Depositing ${formatUSDCDisplay(depositAmount)} from wallet to custody...`);
    const depositTxHash = await depositToCustody(
        client,
        publicClient,
        DEFAULT_TOKEN_ADDRESS,
        depositAmount
    );
    console.log(`    ✓ Deposit TX: ${depositTxHash}`);

    // Wait for custody balance to update
    await new Promise(r => setTimeout(r, 3000));
    const custodyAfterDeposit = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
    console.log(`    Custody balance after deposit: ${formatUSDCDisplay(custodyAfterDeposit)}`);

    // ── Step 2: Create channel (on-chain) ──
    console.log('\n  [Step 2] Create channel (on-chain)...');
    const channelId = await createChannelViaWebSocket(ws, client, publicClient, sessionKeyPair);
    console.log(`    ✓ Channel created: ${channelId}`);

    // Wait for channel indexing
    await waitForChannelIndexing();

    // ── Step 3: Resize/fund channel (on-chain: available → channel-locked → unified balance) ──
    console.log('\n  [Step 3] Fund channel via resize (on-chain)...');
    console.log(`    Moving ${formatUSDCDisplay(depositAmount)} from available → channel-locked → unified balance`);
    const { txHash: resizeTxHash } = await fundChannel({
        ws,
        client,
        publicClient,
        sessionKeyPair,
        channelId,
        amount: depositAmount,
        fundsDestination: userAddress,
    });
    console.log(`    ✓ Resize TX: ${resizeTxHash}`);
    console.log(`    Funds are now in unified balance (off-chain, tracked by clearnode)`);

    // ── Step 4: Create App Session (off-chain: unified balance → app session) ──
    console.log('\n  [Step 4] Create App Session (off-chain)...');
    const sessionResult = await createAppSession({
        ws,
        sessionKeyPair,
        userAddress,
        relayerAddress,
        depositAmount,
        tokenSymbol,
    });

    console.log(`  ✓ App Session started: ${sessionResult.appSessionId}`);
    console.log(`    Version: ${sessionResult.version}`);
    console.log(`    Allocations: ${sessionResult.allocations.length} participants`);

    return {
        appSessionId: sessionResult.appSessionId,
        channelId,
        depositTxHash,
        version: sessionResult.version,
        allocations: sessionResult.allocations,
    };
}

// ============================================================================
// Channel Creation via WebSocket (for App Session flow)
// ============================================================================

/**
 * Create a channel via WebSocket + submit to blockchain
 * This bridges on-chain custody to off-chain unified balance
 */
async function createChannelViaWebSocket(
    ws: WebSocket,
    client: NitroliteClient,
    publicClient: PublicClient,
    sessionKeyPair: SessionKeyPair,
): Promise<`0x${string}`> {
    // Send create channel request
    const createChannelMsg = await createCreateChannelMessage(
        sessionKeyPair.signer,
        {
            chain_id: SEPOLIA_CHAIN_ID,
            token: DEFAULT_TOKEN_ADDRESS,
        }
    );
    ws.send(createChannelMsg);
    console.log('    Create channel request sent...');

    // Wait for create_channel response
    const response = await waitForCreateChannelResponse(ws);

    // Submit to blockchain
    const result = await submitChannelToBlockchain(client, publicClient, response);
    return result.channelId;
}

/**
 * Wait for create_channel confirmation from ClearNode
 */
function waitForCreateChannelResponse(
    ws: WebSocket,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<CreateChannelResponse> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Create channel timeout'));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                // Check for error response first
                if (msg.res && msg.res[1] === 'error') {
                    const errorPayload = msg.res[2];
                    const errorMsg = errorPayload?.error || JSON.stringify(errorPayload);
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(errorMsg));
                    return;
                }
                if (msg.res && msg.res[1] === 'create_channel') {
                    const payload = msg.res[2];
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    resolve(payload as CreateChannelResponse);
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || 'Create channel error'));
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        ws.on('message', handler);
    });
}

// ============================================================================
// Combined Flow: End Session with Settlement
// ============================================================================

export interface EndAppSessionParams {
    ws: WebSocket;
    client: NitroliteClient;
    publicClient: PublicClient;
    walletClient: WalletClient;
    sessionKeyPair: SessionKeyPair;
    appSessionId: `0x${string}`;
    channelId: `0x${string}`;
    userAddress: Address;
    relayerAddress: Address;
    totalSpent: bigint;
    depositAmount: bigint;
    listeningActivity: ListeningActivity;
    tokenSymbol?: string;
}

export interface EndAppSessionResult {
    closeResponse: CloseAppSessionResponse;
    userWithdrawTxHash?: Hash;
    relayerTransferTxHash?: Hash;
    relayerReceived: bigint;
    userRefund: bigint;
    /** Listening activity for relayer to process artist payouts */
    listeningActivity: ListeningActivity;
}

/**
 * End an App Session with the full correct Yellow Network workflow:
 *
 * 1. Close App Session off-chain (app session → unified balance)
 * 2. Off-chain transfer: user sends relayerPayment to relayer's unified balance
 * 3. Close channel (on-chain: unified balance → available/custody balance)
 * 4. User withdraws refund from custody (on-chain: available → wallet)
 * 5. Relayer withdraws earned funds
 *
 * After all steps, user custody = 0.
 */
export async function endAppSession(
    params: EndAppSessionParams
): Promise<EndAppSessionResult> {
    const {
        ws,
        client,
        publicClient,
        sessionKeyPair,
        appSessionId,
        channelId,
        userAddress,
        relayerAddress,
        totalSpent,
        depositAmount,
        listeningActivity,
        tokenSymbol = 'ytest.usd',
    } = params;

    // Calculate fund distribution
    const userRefund = depositAmount - totalSpent;
    const relayerPayment = totalSpent;

    console.log('\n[Ending App Session with Settlement]');
    console.log(`  Session ID: ${appSessionId}`);
    console.log(`  Channel ID: ${channelId}`);
    console.log(`  Total deposited: ${formatUSDCDisplay(depositAmount)}`);
    console.log(`  Total spent: ${formatUSDCDisplay(totalSpent)}`);
    console.log(`  User refund: ${formatUSDCDisplay(userRefund)}`);
    console.log(`  Relayer payment: ${formatUSDCDisplay(relayerPayment)}`);

    // Verify amounts add up
    if (userRefund + relayerPayment !== depositAmount) {
        throw new Error(
            `Fund distribution mismatch: ${userRefund} + ${relayerPayment} !== ${depositAmount}`
        );
    }

    // ── Step 1: Close App Session off-chain (app session → unified balance) ──
    console.log('\n  [Step 1] Closing App Session off-chain with final allocations...');
    const closeAppResponse = await closeAppSession({
        ws,
        sessionKeyPair,
        appSessionId,
        userAddress,
        relayerAddress,
        userAmount: userRefund,
        relayerAmount: relayerPayment,
        tokenSymbol,
    });

    console.log('  Close response:', JSON.stringify(closeAppResponse, null, 2));
    console.log('  Waiting for off-chain close to process...');
    await new Promise(r => setTimeout(r, 5000));

    // ── Step 2: Close channel (on-chain: unified balance → available/custody balance) ──
    // Must happen BEFORE off-chain transfer to release funds from channel-locked state
    console.log(`\n  [Step 2] Closing channel (on-chain: unified → available balance)...`);
    console.log(`    Channel ID: ${channelId}`);

    let closeTxHash: Hash | undefined;
    try {
        await sendCloseChannelRequest({
            ws,
            sessionKeyPair,
            channelId,
            fundsDestination: userAddress,
        });

        const closeChannelResponse = await waitForCloseConfirmation(ws, channelId);
        closeTxHash = await submitCloseToBlockchain(client, publicClient, closeChannelResponse);
        console.log(`    ✓ Channel closed on-chain: ${closeTxHash}`);

        // Wait for close to settle
        await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
        console.log(`    ⚠ Channel close failed: ${err}`);
        console.log(`    Continuing with off-chain transfer...`);
    }

    // ── Step 3: Off-chain transfer (relayer payment: user's unified → relayer's unified) ──
    console.log(`\n  [Step 3] Off-chain transfer: sending relayer payment to relayer's unified balance...`);

    if (relayerPayment > 0n) {
        console.log(`    From: ${userAddress}`);
        console.log(`    To: ${relayerAddress}`);
        console.log(`    Amount: ${formatUSDCDisplay(relayerPayment)}`);

        try {
            const transferMsg = await createTransferMessage(
                sessionKeyPair.signer,
                {
                    destination: relayerAddress,
                    allocations: [
                        {
                            asset: tokenSymbol,
                            amount: relayerPayment.toString(),
                        },
                    ],
                }
            );

            ws.send(transferMsg);

            // Wait for transfer confirmation
            await waitForTransferConfirmation(ws);
            console.log(`    ✓ Off-chain transfer complete`);
        } catch (err) {
            console.log(`    ⚠ Off-chain transfer failed: ${err}`);
        }

        // Brief wait for balances to update
        await new Promise(r => setTimeout(r, 2000));
    } else {
        console.log(`    No payment for relayer (user spent nothing)`);
    }

    // ── Step 4: User withdraws refund from custody (on-chain: available → wallet) ──
    let userWithdrawTxHash: Hash | undefined;
    console.log(`\n  [Step 4] User withdrawing refund from custody (on-chain)...`);

    if (userRefund > 0n) {
        // Wait a bit for custody balance to reflect channel close
        await new Promise(r => setTimeout(r, 3000));

        const custodyBalance = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
        console.log(`    User custody balance: ${formatUSDCDisplay(custodyBalance)}`);
        console.log(`    Withdrawing user refund: ${formatUSDCDisplay(userRefund)}`);

        try {
            // Withdraw what's available (may differ slightly from expected refund)
            const withdrawAmount = custodyBalance > 0n ? (custodyBalance < userRefund ? custodyBalance : userRefund) : 0n;
            if (withdrawAmount > 0n) {
                userWithdrawTxHash = await client.withdrawal(DEFAULT_TOKEN_ADDRESS, withdrawAmount);
                console.log(`    ✓ User withdrawal TX: ${userWithdrawTxHash}`);
                await publicClient.waitForTransactionReceipt({ hash: userWithdrawTxHash });
                console.log('    ✓ User withdrawal confirmed');
            } else {
                console.log('    No funds available to withdraw');
            }
        } catch (err) {
            console.log(`    ⚠ User withdrawal failed: ${err}`);
        }
    } else {
        console.log(`    No refund due (user spent entire deposit)`);
    }

    // ── Step 5: Relayer withdraws earned funds ──
    console.log(`\n  [Step 5] Relayer withdrawing earned funds via channel dance...`);

    let relayerWithdrawTxHash: Hash | undefined;
    if (relayerPayment > 0n) {
        try {
            const relayerResult = await performRelayerWithdrawal({ expectedAmount: relayerPayment });
            if (relayerResult.success) {
                relayerWithdrawTxHash = relayerResult.txHash;
                console.log(`    ✓ Relayer withdrawal complete: ${formatUSDCDisplay(relayerResult.withdrawnAmount)}`);
            } else {
                console.log(`    ⚠ Relayer withdrawal failed: ${relayerResult.error}`);
            }
        } catch (err) {
            console.log(`    ⚠ Relayer withdrawal failed: ${err}`);
        }
    } else {
        console.log(`    No payment for relayer (user spent nothing)`);
    }

    // Verify final balances
    await new Promise(r => setTimeout(r, 2000));

    const finalUserWallet = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
    const finalUserCustody = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

    console.log('\n  [Final Balances]');
    console.log(`    User wallet: ${formatUSDCDisplay(finalUserWallet)}`);
    console.log(`    User custody: ${formatUSDCDisplay(finalUserCustody)} (should be 0)`);
    console.log(`    Relayer payment: ${formatUSDCDisplay(relayerPayment)}`);

    // Log listening activity for verification
    console.log(`\n  Listening Activity (${listeningActivity.length} songs):`);
    for (const record of listeningActivity) {
        console.log(`    - ${record.songListened}: ${formatUSDCDisplay(record.amountSpent)}`);
    }

    return {
        closeResponse: closeAppResponse,
        userWithdrawTxHash,
        relayerTransferTxHash: relayerWithdrawTxHash,
        relayerReceived: relayerPayment,
        userRefund,
        listeningActivity,
    };
}

/**
 * Wait for off-chain transfer confirmation
 */
function waitForTransferConfirmation(
    ws: WebSocket,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Transfer timeout'));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                // Check for error response first (critical: msg.res[1] === 'error')
                if (msg.res && msg.res[1] === 'error') {
                    const errorPayload = msg.res[2];
                    const errorMsg = errorPayload?.error || JSON.stringify(errorPayload);
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(errorMsg));
                    return;
                }
                if (msg.res && msg.res[1] === 'transfer') {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    console.log('    Transfer response:', JSON.stringify(msg.res[2], null, 2));
                    resolve();
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || 'Transfer error'));
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        ws.on('message', handler);
    });
}
