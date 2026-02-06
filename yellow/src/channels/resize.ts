import {
    createResizeChannelMessage,
    NitroliteClient,
} from '@erc7824/nitrolite';
import type { PublicClient, Address, Hash } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { ResizeChannelResponse } from '../types';
import { TIMING, formatUSDCDisplay, DEFAULT_TOKEN_ADDRESS } from '../config';
import { getChannelBalance } from './create';
import { getTokenBalance } from './relayer';

// ============================================================================
// Deposit to Custody
// ============================================================================

/**
 * Deposit ERC20 tokens to custody contract
 * This must be done before funding a channel with real tokens
 */
export async function depositToCustody(
    client: NitroliteClient,
    publicClient: PublicClient,
    tokenAddress: Address,
    amount: bigint
): Promise<Hash> {
    console.log(`  Depositing ${formatUSDCDisplay(amount)} to custody...`);

    const txHash = await client.deposit(tokenAddress, amount);
    console.log(`  Deposit TX: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
        throw new Error(`Deposit transaction failed: ${txHash}`);
    }

    console.log(`  ✓ Deposit confirmed`);
    return txHash;
}

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
    let proofStates: Parameters<typeof client.resizeChannel>[0]['proofStates'] = [];
    try {
        const onChainData = await client.getChannelData(channel_id);
        if (onChainData.lastValidState) {
            proofStates = [onChainData.lastValidState] as typeof proofStates;
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
 * 1. Deposits ERC20 tokens to custody (if needed)
 * 2. Sends resize request to ClearNode
 * 3. Waits for confirmation
 * 4. Submits to blockchain
 */
export async function fundChannel(
    params: FundChannelParams
): Promise<{ txHash: `0x${string}`; depositTxHash?: Hash }> {
    const {
        ws,
        client,
        publicClient,
        sessionKeyPair,
        channelId,
        amount,
        fundsDestination,
    } = params;

    // Get custody address from client
    const custodyAddress = (client as unknown as { addresses: { custody: Address } }).addresses.custody;

    // Step 1: Check current custody balance and deposit if needed
    // Use NitroliteClient's getAccountBalance for accurate custody balance
    const custodyBalanceBefore = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
    console.log(`  User custody balance: ${custodyBalanceBefore} units`);

    let depositTxHash: Hash | undefined;

    // If custody balance is insufficient, deposit from wallet
    if (custodyBalanceBefore < amount) {
        const depositNeeded = amount - custodyBalanceBefore;
        console.log(`  Need to deposit ${depositNeeded} units to custody`);

        // Check wallet balance first
        const walletBalance = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, fundsDestination);
        console.log(`  User wallet balance: ${walletBalance} units`);

        if (walletBalance < depositNeeded) {
            const totalAvailable = walletBalance + custodyBalanceBefore;
            throw new Error(
                `Insufficient funds. Need ${amount} units but only have ${totalAvailable} total ` +
                `(wallet: ${walletBalance}, custody: ${custodyBalanceBefore}). ` +
                `Please get more test tokens or use a smaller deposit amount.`
            );
        }

        depositTxHash = await depositToCustody(
            client,
            publicClient,
            DEFAULT_TOKEN_ADDRESS,
            depositNeeded
        );

        // Wait for custody balance to update
        await new Promise((r) => setTimeout(r, 3000));

        const custodyBalanceAfterDeposit = await client.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
        console.log(`  Custody balance after deposit: ${custodyBalanceAfterDeposit} units`);
    } else {
        console.log(`  Custody balance sufficient, no deposit needed`);
    }

    // Check channel balance before resize
    const channelBalanceBefore = await getChannelBalance(publicClient, custodyAddress, channelId, DEFAULT_TOKEN_ADDRESS);
    console.log(`  Channel balance before resize: ${channelBalanceBefore} units`);

    // Step 2: Send resize request to ClearNode
    await sendResizeChannelRequest({
        ws,
        sessionKeyPair,
        channelId,
        allocateAmount: amount,
        fundsDestination,
    });

    // Wait for ClearNode confirmation
    const resizeResponse = await waitForResizeConfirmation(ws, channelId);

    // Log the resize response allocations
    console.log('  Resize response allocations:');
    for (const alloc of resizeResponse.state.allocations) {
        console.log(`    ${alloc.destination.slice(0, 10)}...: ${formatUSDCDisplay(BigInt(alloc.amount))}`);
    }

    // Step 3: Submit to blockchain
    const result = await submitResizeToBlockchain(client, publicClient, resizeResponse);

    // Wait for balance to update
    await new Promise((r) => setTimeout(r, TIMING.resizeConfirmDelay));

    // Check channel balance after resize
    const channelBalanceAfter = await getChannelBalance(publicClient, custodyAddress, channelId, DEFAULT_TOKEN_ADDRESS);
    console.log(`  Channel balance after resize: ${channelBalanceAfter} units (expected: ${amount} units)`);

    if (channelBalanceAfter === 0n) {
        console.log('  ⚠ WARNING: Channel on-chain balance is 0. Funds may be tracked off-chain only.');
    } else if (channelBalanceAfter >= amount) {
        console.log('  ✓ Channel funded successfully with on-chain tokens');
    }

    return { txHash: result.txHash, depositTxHash };
}
