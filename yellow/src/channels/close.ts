import { createCloseChannelMessage, NitroliteClient } from '@erc7824/nitrolite';
import type { PublicClient, Address, Hash } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { CloseChannelResponse } from '../types';
import { TIMING, formatUSDCDisplay } from '../config';
import { getUserCustodyBalance } from './create';

// ============================================================================
// Channel State Helpers
// ============================================================================

/**
 * Get on-chain channel state for debugging
 */
export async function logOnChainChannelState(
    client: NitroliteClient,
    channelId: `0x${string}`
): Promise<void> {
    try {
        const data = await client.getChannelData(channelId);
        console.log('  On-chain channel state:');
        console.log(`    Status: ${data.status}`);
        console.log(`    Challenge expiry: ${data.challengeExpiry}`);
        console.log(`    Last valid state version: ${data.lastValidState.version}`);
        console.log(`    Allocations:`);
        for (const alloc of data.lastValidState.allocations) {
            console.log(`      ${alloc.destination.slice(0, 10)}...: ${formatUSDCDisplay(alloc.amount)}`);
        }
    } catch (err) {
        console.log(`  Could not get on-chain channel state: ${err}`);
    }
}

// ============================================================================
// Close Channel
// ============================================================================

export interface CloseChannelParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    channelId: `0x${string}`;
    fundsDestination: Address;
}

/**
 * Send a close channel request to ClearNode
 */
export async function sendCloseChannelRequest(
    params: CloseChannelParams
): Promise<void> {
    const { ws, sessionKeyPair, channelId, fundsDestination } = params;

    const closeMsg = await createCloseChannelMessage(
        sessionKeyPair.signer,
        channelId,
        fundsDestination
    );

    ws.send(closeMsg);
}

/**
 * Wait for close channel confirmation from ClearNode
 */
export function waitForCloseConfirmation(
    ws: WebSocket,
    channelId: `0x${string}`,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<CloseChannelResponse> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Close channel timeout'));
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
                if (msg.res && msg.res[1] === 'close_channel') {
                    const payload = msg.res[2];
                    if (payload.channel_id === channelId) {
                        clearTimeout(timeout);
                        ws.off('message', handler);
                        resolve(payload as CloseChannelResponse);
                    }
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || 'Close channel error'));
                }
            } catch (err) {
                // Ignore parse errors, wait for valid message
            }
        };

        ws.on('message', handler);
    });
}

/**
 * Submit close to blockchain with retry logic and gas override
 *
 * The Nitrolite SDK sometimes underestimates gas, causing "out of gas" errors.
 * This function:
 * 1. Tries with the SDK first
 * 2. Waits for receipt and verifies success
 * 3. If failed, retries up to MAX_RETRIES times
 */
export async function submitCloseToBlockchain(
    client: NitroliteClient,
    publicClient: PublicClient,
    response: CloseChannelResponse,
    maxRetries: number = 3
): Promise<Hash> {
    const { channel_id, state, server_signature } = response;

    const finalState = {
        intent: state.intent,
        version: BigInt(state.version),
        data: state.state_data || state.data,
        allocations: state.allocations.map((a) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
        })),
        channelId: channel_id,
        serverSignature: server_signature,
    };

    let lastError: Error | null = null;
    let lastTxHash: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`  Close attempt ${attempt}/${maxRetries}...`);

            const txHash = await client.closeChannel({
                finalState: finalState as unknown as Parameters<typeof client.closeChannel>[0]['finalState'],
                stateData: state.state_data || state.data || '0x',
            });

            lastTxHash = txHash;
            console.log(`  TX submitted: ${txHash}`);

            // Wait for receipt with timeout
            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash as Hash,
                timeout: 60_000,
            });

            if (receipt.status === 'success') {
                console.log(`  ✓ Close confirmed on-chain`);
                return txHash as Hash;
            }

            // Transaction reverted
            console.log(`  ✗ TX reverted (attempt ${attempt})`);
            lastError = new Error(`Close TX reverted: ${txHash}`);

            // Wait before retry
            if (attempt < maxRetries) {
                console.log(`  Waiting 5s before retry...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.log(`  ✗ Error: ${lastError.message}`);

            if (attempt < maxRetries) {
                console.log(`  Waiting 5s before retry...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    // All retries failed - check if channel is actually closed
    console.log(`  Checking if channel is already closed...`);
    try {
        const openChannels = await client.getOpenChannels();
        const isStillOpen = openChannels.includes(channel_id);

        if (!isStillOpen) {
            console.log(`  ✓ Channel is closed (confirmed on L1)`);
            return (lastTxHash || '0x') as Hash;
        }
    } catch (err) {
        // Ignore error checking open channels
    }

    throw lastError || new Error(`Failed to close channel after ${maxRetries} attempts`);
}

// ============================================================================
// Withdrawal
// ============================================================================

export interface WithdrawParams {
    client: NitroliteClient;
    publicClient: PublicClient;
    token: Address;
    userAddress: Address;
    custodyAddress: Address;
}

/**
 * Withdraw all available funds from custody
 */
export async function withdrawFromCustody(
    params: WithdrawParams
): Promise<{ amount: bigint; txHash: Hash | null }> {
    const { client, publicClient, token, userAddress, custodyAddress } = params;

    // Wait for close to settle
    await new Promise((r) => setTimeout(r, TIMING.closeSettleDelay));

    // Check withdrawable balance
    const withdrawableBalance = await getUserCustodyBalance(
        publicClient,
        custodyAddress,
        userAddress,
        token
    );

    if (withdrawableBalance <= 0n) {
        return { amount: 0n, txHash: null };
    }

    // Withdraw
    const txHash = await client.withdrawal(token, withdrawableBalance);

    return { amount: withdrawableBalance, txHash: txHash as Hash };
}

// ============================================================================
// Combined Close Flow
// ============================================================================

export interface CloseAndWithdrawParams {
    ws: WebSocket;
    client: NitroliteClient;
    publicClient: PublicClient;
    sessionKeyPair: SessionKeyPair;
    channelId: `0x${string}`;
    fundsDestination: Address;
    token: Address;
    custodyAddress: Address;
}

export interface CloseAndWithdrawResult {
    closeTxHash: Hash;
    withdrawAmount: bigint;
    withdrawTxHash: Hash | null;
}

/**
 * Close channel and withdraw remaining funds
 * This is the final step in ending a session
 */
export async function closeChannelAndWithdraw(
    params: CloseAndWithdrawParams
): Promise<CloseAndWithdrawResult> {
    const {
        ws,
        client,
        publicClient,
        sessionKeyPair,
        channelId,
        fundsDestination,
        token,
        custodyAddress,
    } = params;

    // Send close request
    await sendCloseChannelRequest({
        ws,
        sessionKeyPair,
        channelId,
        fundsDestination,
    });

    // Wait for ClearNode confirmation
    const closeResponse = await waitForCloseConfirmation(ws, channelId);

    // Submit close to blockchain and verify it succeeded
    const closeTxHash = await submitCloseToBlockchain(client, publicClient, closeResponse);

    // Withdraw remaining funds
    const { amount: withdrawAmount, txHash: withdrawTxHash } = await withdrawFromCustody({
        client,
        publicClient,
        token,
        userAddress: fundsDestination,
        custodyAddress,
    });

    return {
        closeTxHash,
        withdrawAmount,
        withdrawTxHash,
    };
}
