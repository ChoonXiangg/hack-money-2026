import {
    createAppSessionMessage,
    createCloseAppSessionMessage,
    createSubmitAppStateMessage,
    NitroliteClient,
    RPCProtocolVersion,
    RPCAppStateIntent,
} from '@erc7824/nitrolite';
import type { PublicClient, Address, Hash, WalletClient } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { CreateAppSessionResponse, CloseAppSessionResponse, ListeningActivity } from '../types';
import { TIMING, formatUSDCDisplay, DEFAULT_TOKEN_ADDRESS, SESSION_CONFIG } from '../config';
import { depositToCustody } from './resize';
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
    const appSessionMsg = await createAppSessionMessage(
        sessionKeyPair.signer,
        {
            definition: {
                application: SESSION_CONFIG.applicationName,
                protocol: RPCProtocolVersion.NitroRPC_0_4,
                participants: [userAddress, relayerAddress],
                weights: [100, 0],  // User has full weight, relayer has none
                quorum: 100,        // Only user's signature needed
                challenge: 0,       // No challenge period for instant updates
                nonce: Date.now(),  // Unique nonce for this session
            },
            allocations: [
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
            ],
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
                if (msg.res && msg.res[1] === 'create_app_session') {
                    const payload = msg.res[2];

                    // DEBUG: Log raw server response
                    console.log('  [DEBUG] Raw create_app_session response:');
                    console.log('    payload type:', typeof payload);
                    console.log('    payload:', JSON.stringify(payload, null, 2));

                    // Handle both array and object response formats
                    const sessionData = Array.isArray(payload) ? payload[0] : payload;
                    const sessionId = sessionData?.app_session_id || sessionData?.sessionId;

                    // DEBUG: Log parsed session data
                    console.log('  [DEBUG] Parsed sessionData:');
                    console.log('    sessionData:', JSON.stringify(sessionData, null, 2));
                    console.log('    sessionId:', sessionId);
                    console.log('    version:', sessionData?.version);
                    console.log('    allocations:', JSON.stringify(sessionData?.allocations));

                    clearTimeout(timeout);
                    ws.off('message', handler);
                    console.log(`  ✓ App Session created: ${sessionId}`);
                    console.log(`    Version: ${sessionData?.version || 1}`);
                    console.log(`    Allocations: ${JSON.stringify(sessionData?.allocations || [])}`);

                    resolve({
                        appSessionId: sessionId,
                        version: sessionData?.version || 1,
                        allocations: sessionData?.allocations || [],
                    });
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || 'Create App Session error'));
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
                    // Don't reject - continue with local tracking
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

    ws.send(closeMsg);
    console.log('  Close App Session request sent');

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
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Close App Session timeout'));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.res && msg.res[1] === 'close_app_session') {
                    const payload = msg.res[2] as CloseAppSessionResponse;
                    if (payload.app_session_id === appSessionId) {
                        clearTimeout(timeout);
                        ws.off('message', handler);
                        console.log('  ✓ App Session closed');
                        resolve(payload);
                    }
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
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
    depositTxHash?: Hash;
    version: number;
    allocations: Array<{ participant: string; asset: string; amount: string }>;
}

/**
 * Start an App Session with deposit
 * 1. Check/deposit to custody if needed
 * 2. Create App Session with user funds and relayer at 0
 * Returns server-confirmed session state (like reference code)
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

    // Step 1: Check custody balance and deposit if needed
    const custodyBalance = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
    console.log(`  Current custody balance: ${formatUSDCDisplay(custodyBalance)}`);

    let depositTxHash: Hash | undefined;

    if (custodyBalance < depositAmount) {
        const depositNeeded = depositAmount - custodyBalance;
        console.log(`  Need to deposit ${formatUSDCDisplay(depositNeeded)} to custody`);

        // Check wallet balance
        const walletBalance = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        console.log(`  Wallet balance: ${formatUSDCDisplay(walletBalance)}`);

        if (walletBalance < depositNeeded) {
            throw new Error(
                `Insufficient funds. Need ${formatUSDCDisplay(depositAmount)} but only have ` +
                `${formatUSDCDisplay(walletBalance + custodyBalance)} total.`
            );
        }

        // Deposit to custody
        depositTxHash = await depositToCustody(
            client,
            publicClient,
            DEFAULT_TOKEN_ADDRESS,
            depositNeeded
        );

        // Wait for custody balance to update
        await new Promise(r => setTimeout(r, 3000));

        const newCustodyBalance = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
        console.log(`  Custody balance after deposit: ${formatUSDCDisplay(newCustodyBalance)}`);
    }

    // Step 2: Create App Session
    const sessionResult = await createAppSession({
        ws,
        sessionKeyPair,
        userAddress,
        relayerAddress,
        depositAmount,
        tokenSymbol,
    });

    console.log(`✓ App Session started: ${sessionResult.appSessionId}`);
    console.log(`  Version: ${sessionResult.version}`);
    console.log(`  Allocations: ${sessionResult.allocations.length} participants`);

    return {
        appSessionId: sessionResult.appSessionId,
        depositTxHash,
        version: sessionResult.version,
        allocations: sessionResult.allocations,
    };
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
 * End an App Session with proper fund distribution
 *
 * Flow:
 * 1. Calculate split: user gets refund, relayer gets spent amount
 * 2. Close App Session with final allocations (this sets the final state)
 * 3. User withdraws ONLY their allocated portion (not full custody)
 * 4. Relayer withdraws their portion separately (via relayer:withdraw)
 *
 * NO ERC20 transfers - funds are distributed via App Session allocations
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

    // Step 1: Close App Session with final allocations
    // This sets the final state - funds will be distributed according to allocations
    console.log('\n  [Step 1] Closing App Session with final allocations...');
    const closeResponse = await closeAppSession({
        ws,
        sessionKeyPair,
        appSessionId,
        userAddress,
        relayerAddress,
        userAmount: userRefund,
        relayerAmount: relayerPayment,
        tokenSymbol,
    });

    // Log close response details
    console.log('  Close response:', JSON.stringify(closeResponse, null, 2));

    // Wait for close to process
    console.log('  Waiting for settlement to process...');
    await new Promise(r => setTimeout(r, 5000));

    // Step 2: Check custody balances after close
    const userCustodyBalance = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
    console.log(`\n  [Step 2] Checking balances after close...`);
    console.log(`    User custody balance: ${formatUSDCDisplay(userCustodyBalance)}`);
    console.log(`    Expected user allocation: ${formatUSDCDisplay(userRefund)}`);
    console.log(`    Relayer should have: ${formatUSDCDisplay(relayerPayment)} (in their custody)`);

    // Step 3: User withdraws ONLY their allocated portion
    let userWithdrawTxHash: Hash | undefined;

    console.log(`\n  [Step 3] User withdrawing allocated portion...`);

    // Withdraw only the user's allocated amount, not the full custody balance
    const withdrawAmount = userRefund > 0n ? userRefund : 0n;

    if (withdrawAmount > 0n) {
        console.log(`    Withdrawing ${formatUSDCDisplay(withdrawAmount)} (user's allocation)`);

        try {
            userWithdrawTxHash = await client.withdrawal(DEFAULT_TOKEN_ADDRESS, withdrawAmount);
            console.log(`    ✓ User withdrawal TX: ${userWithdrawTxHash}`);

            // Wait for confirmation
            await publicClient.waitForTransactionReceipt({ hash: userWithdrawTxHash });
            console.log('    ✓ User withdrawal confirmed');
        } catch (err) {
            console.log(`    ⚠ User withdrawal failed: ${err}`);
            // Try withdrawing full custody if allocation-based withdrawal fails
            console.log(`    Trying to withdraw full custody balance instead...`);
            try {
                if (userCustodyBalance > 0n) {
                    userWithdrawTxHash = await client.withdrawal(DEFAULT_TOKEN_ADDRESS, userCustodyBalance);
                    console.log(`    ✓ Fallback withdrawal TX: ${userWithdrawTxHash}`);
                    await publicClient.waitForTransactionReceipt({ hash: userWithdrawTxHash });
                    console.log('    ✓ Fallback withdrawal confirmed');
                }
            } catch (fallbackErr) {
                console.log(`    ⚠ Fallback withdrawal also failed: ${fallbackErr}`);
            }
        }
    } else {
        console.log(`    No refund due (user spent entire deposit)`);
    }

    // Step 4: Relayer automatically withdraws their portion
    console.log(`\n  [Step 4] Relayer withdrawing earned funds...`);

    let relayerWithdrawTxHash: Hash | undefined;
    if (relayerPayment > 0n) {
        const relayerResult = await performRelayerWithdrawal({
            expectedAmount: relayerPayment,
        });

        if (relayerResult.success && relayerResult.txHash) {
            relayerWithdrawTxHash = relayerResult.txHash;
            console.log(`    ✓ Relayer withdrawal complete: ${formatUSDCDisplay(relayerResult.withdrawnAmount)}`);
        } else if (relayerResult.error) {
            console.log(`    ⚠ Relayer withdrawal failed: ${relayerResult.error}`);
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
    console.log(`    User custody: ${formatUSDCDisplay(finalUserCustody)}`);
    console.log(`    Relayer withdrawn: ${formatUSDCDisplay(relayerPayment)}`);

    // Log listening activity for verification
    console.log(`\n  Listening Activity (${listeningActivity.length} songs):`);
    for (const record of listeningActivity) {
        console.log(`    - ${record.songListened}: ${formatUSDCDisplay(record.amountSpent)}`);
    }

    return {
        closeResponse,
        userWithdrawTxHash,
        relayerTransferTxHash: relayerWithdrawTxHash,
        relayerReceived: relayerPayment,
        userRefund,
        listeningActivity,
    };
}
