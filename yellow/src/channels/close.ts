import { createCloseChannelMessage, NitroliteClient } from '@erc7824/nitrolite';
import type { PublicClient, Address, Hash } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { CloseChannelResponse } from '../types';
import { TIMING } from '../config';
import { getUserCustodyBalance } from './create';

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
 * Submit close to blockchain
 */
export async function submitCloseToBlockchain(
    client: NitroliteClient,
    response: CloseChannelResponse
): Promise<Hash> {
    const { channel_id, state, server_signature } = response;

    const txHash = await client.closeChannel({
        finalState: {
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
        } as unknown as Parameters<typeof client.closeChannel>[0]['finalState'],
        stateData: state.state_data || state.data || '0x',
    });

    return txHash as Hash;
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

    // Submit close to blockchain
    const closeTxHash = await submitCloseToBlockchain(client, closeResponse);

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
