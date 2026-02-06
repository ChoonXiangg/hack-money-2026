import { createTransferMessage } from '@erc7824/nitrolite';
import type { Address } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { TransferResult } from '../types';
import { TIMING } from '../config';

// ============================================================================
// Transfer Types
// ============================================================================

export interface TransferParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    destination: Address;
    asset: string;
    amount: string;
}

export interface BatchTransferParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    transfers: Array<{
        destination: Address;
        amount: bigint;
    }>;
    asset: string;
}

// ============================================================================
// Single Transfer
// ============================================================================

/**
 * Send a transfer to a destination address
 * This is an off-chain transfer through Yellow's ledger
 */
export async function sendTransfer(params: TransferParams): Promise<void> {
    const { ws, sessionKeyPair, destination, asset, amount } = params;

    const transferMsg = await createTransferMessage(
        sessionKeyPair.signer,
        {
            destination,
            allocations: [{
                asset,
                amount,
            }],
        },
        Date.now()
    );

    ws.send(transferMsg);
}

/**
 * Wait for transfer confirmation
 */
export function waitForTransferConfirmation(
    ws: WebSocket,
    timeoutMs: number = TIMING.wsMessageTimeout
): Promise<TransferResult> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error('Transfer timeout'));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.res && msg.res[1] === 'transfer') {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    resolve({
                        success: true,
                        destination: msg.res[2]?.destination || '0x0' as Address,
                        amount: BigInt(msg.res[2]?.amount || '0'),
                        timestamp: Date.now(),
                    });
                }
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    reject(new Error(msg.error.message || 'Transfer error'));
                }
            } catch (err) {
                // Ignore parse errors, wait for valid message
            }
        };

        ws.on('message', handler);
    });
}

/**
 * Send transfer and wait for confirmation
 */
export async function transferAndConfirm(
    params: TransferParams
): Promise<TransferResult> {
    const { ws } = params;

    // Send the transfer
    await sendTransfer(params);

    // Wait for confirmation
    return waitForTransferConfirmation(ws);
}

// ============================================================================
// Batch Transfers (for settling with multiple artists)
// ============================================================================

/**
 * Send multiple transfers sequentially
 * Used at session end to pay all artists
 */
export async function sendBatchTransfers(
    params: BatchTransferParams
): Promise<TransferResult[]> {
    const { ws, sessionKeyPair, transfers, asset } = params;
    const results: TransferResult[] = [];

    for (const transfer of transfers) {
        try {
            const result = await transferAndConfirm({
                ws,
                sessionKeyPair,
                destination: transfer.destination,
                asset,
                amount: transfer.amount.toString(),
            });
            results.push(result);
        } catch (error) {
            // Record failed transfer
            results.push({
                success: false,
                destination: transfer.destination,
                amount: transfer.amount,
                timestamp: Date.now(),
            });
            console.error(`Transfer to ${transfer.destination} failed:`, error);
        }
    }

    return results;
}

// ============================================================================
// Artist Payment Helpers
// ============================================================================

/**
 * Convert artist totals map to transfer array
 */
export function prepareArtistTransfers(
    artistTotals: Map<Address, bigint>
): Array<{ destination: Address; amount: bigint }> {
    const transfers: Array<{ destination: Address; amount: bigint }> = [];

    for (const [address, amount] of artistTotals) {
        if (amount > 0n) {
            transfers.push({ destination: address, amount });
        }
    }

    return transfers;
}

/**
 * Pay all artists from session totals
 */
export async function payAllArtists(
    ws: WebSocket,
    sessionKeyPair: SessionKeyPair,
    artistTotals: Map<Address, bigint>,
    asset: string = 'ytest.usd'
): Promise<TransferResult[]> {
    const transfers = prepareArtistTransfers(artistTotals);

    if (transfers.length === 0) {
        return [];
    }

    return sendBatchTransfers({
        ws,
        sessionKeyPair,
        transfers,
        asset,
    });
}
