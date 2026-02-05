import {
    createResizeChannelMessage,
    NitroliteClient,
} from '@erc7824/nitrolite';
import type { PublicClient, Address } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { ResizeChannelResponse } from '../types';
import { TIMING } from '../config';

// ============================================================================
// Resize Channel (Funding)
// ============================================================================

export interface ResizeChannelParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    channelId: `0x${string}`;
    allocateAmount: bigint;
    fundsDestination: Address;
}

/**
 * Send a resize channel request to ClearNode
 * This funds the channel from the user's Unified Balance (off-chain faucet)
 */
export async function sendResizeChannelRequest(
    params: ResizeChannelParams
): Promise<void> {
    const { ws, sessionKeyPair, channelId, allocateAmount, fundsDestination } = params;

    const resizeMsg = await createResizeChannelMessage(
        sessionKeyPair.signer,
        {
            channel_id: channelId,
            allocate_amount: allocateAmount,
            funds_destination: fundsDestination,
        }
    );

    ws.send(resizeMsg);
}

/**
 * Wait for resize confirmation from ClearNode
 */
export function waitForResizeConfirmation(
    ws: WebSocket,
    channelId: `0x${string}`,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<ResizeChannelResponse> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Resize channel timeout'));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.res && msg.res[1] === 'resize_channel') {
                    const payload = msg.res[2];
                    if (payload.channel_id === channelId) {
                        clearTimeout(timeout);
                        ws.off('message', handler);
                        resolve(payload as ResizeChannelResponse);
                    }
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || 'Resize channel error'));
                }
            } catch (err) {
                // Ignore parse errors, wait for valid message
            }
        };

        ws.on('message', handler);
    });
}

/**
 * Submit resize to blockchain
 */
export async function submitResizeToBlockchain(
    client: NitroliteClient,
    publicClient: PublicClient,
    response: ResizeChannelResponse
): Promise<{ txHash: `0x${string}` }> {
    const { channel_id, state, server_signature } = response;

    // Construct the resize state object expected by the SDK
    const resizeState = {
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
    } as unknown as Parameters<typeof client.resizeChannel>[0]['resizeState'];

    // Try to get proof states from on-chain data
    let proofStates: unknown[] = [];
    try {
        const onChainData = await client.getChannelData(channel_id);
        if (onChainData.lastValidState) {
            proofStates = [onChainData.lastValidState];
        }
    } catch (e) {
        // No proof states available, continue without them
    }

    // Submit to blockchain
    const result = await client.resizeChannel({
        resizeState,
        proofStates,
    });

    return { txHash: result.txHash };
}

// ============================================================================
// Combined Resize Flow
// ============================================================================

export interface FundChannelParams {
    ws: WebSocket;
    client: NitroliteClient;
    publicClient: PublicClient;
    sessionKeyPair: SessionKeyPair;
    channelId: `0x${string}`;
    amount: bigint;
    fundsDestination: Address;
}

/**
 * Fund a channel with the specified amount
 * This is a combined operation that:
 * 1. Sends resize request to ClearNode
 * 2. Waits for confirmation
 * 3. Submits to blockchain
 */
export async function fundChannel(
    params: FundChannelParams
): Promise<{ txHash: `0x${string}` }> {
    const {
        ws,
        client,
        publicClient,
        sessionKeyPair,
        channelId,
        amount,
        fundsDestination,
    } = params;

    // Send resize request
    await sendResizeChannelRequest({
        ws,
        sessionKeyPair,
        channelId,
        allocateAmount: amount,
        fundsDestination,
    });

    // Wait for ClearNode confirmation
    const resizeResponse = await waitForResizeConfirmation(ws, channelId);

    // Submit to blockchain
    const result = await submitResizeToBlockchain(client, publicClient, resizeResponse);

    // Wait for balance to update
    await new Promise((r) => setTimeout(r, TIMING.resizeConfirmDelay));

    return result;
}
