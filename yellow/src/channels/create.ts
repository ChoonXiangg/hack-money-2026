import {
    createCreateChannelMessage,
    createGetLedgerBalancesMessage,
    NitroliteClient,
} from '@erc7824/nitrolite';
import type { PublicClient, Address } from 'viem';
import WebSocket from 'ws';
import type { SessionKeyPair } from '../auth';
import type { CreateChannelResponse, Channel, ClearNodeConfig } from '../types';
import { SEPOLIA_CHAIN_ID, TIMING, DEFAULT_TOKEN_ADDRESS } from '../config';

// ============================================================================
// Channel Discovery
// ============================================================================

/**
 * Request ledger balances and channels from ClearNode
 */
export async function requestLedgerBalances(
    ws: WebSocket,
    sessionKeyPair: SessionKeyPair,
    walletAddress: Address
): Promise<void> {
    const ledgerMsg = await createGetLedgerBalancesMessage(
        sessionKeyPair.signer,
        walletAddress,
        Date.now()
    );
    ws.send(ledgerMsg);
}

/**
 * Find an existing open channel from the channels list
 */
export function findOpenChannel(channels: Channel[]): Channel | undefined {
    return channels.find((c) => c.status === 'open');
}

/**
 * Get the token address from config for the current chain
 */
export function getTokenFromConfig(
    config: ClearNodeConfig,
    chainId: number = SEPOLIA_CHAIN_ID
): Address {
    const supportedAsset = config.assets?.find((a) => a.chain_id === chainId);
    return supportedAsset ? supportedAsset.token : DEFAULT_TOKEN_ADDRESS;
}

// ============================================================================
// Channel Creation
// ============================================================================

export interface CreateChannelParams {
    ws: WebSocket;
    sessionKeyPair: SessionKeyPair;
    token: Address;
    chainId?: number;
}

/**
 * Send a create channel request to ClearNode
 */
export async function sendCreateChannelRequest(
    params: CreateChannelParams
): Promise<void> {
    const { ws, sessionKeyPair, token, chainId = SEPOLIA_CHAIN_ID } = params;

    const createChannelMsg = await createCreateChannelMessage(
        sessionKeyPair.signer,
        {
            chain_id: chainId,
            token: token,
        }
    );

    ws.send(createChannelMsg);
}

/**
 * Submit channel creation to blockchain
 */
export async function submitChannelToBlockchain(
    client: NitroliteClient,
    publicClient: PublicClient,
    response: CreateChannelResponse
): Promise<{ channelId: `0x${string}`; txHash: `0x${string}` }> {
    const { channel_id, channel, state, server_signature } = response;

    // Transform state object to match UnsignedState interface
    // Server response structure matches SDK expectations, cast through unknown
    const unsignedInitialState = {
        intent: state.intent,
        version: BigInt(state.version),
        data: state.state_data,
        allocations: state.allocations.map((a) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
        })),
    } as unknown as Parameters<typeof client.createChannel>[0]['unsignedInitialState'];

    // Submit to blockchain
    // Channel type comes from server, cast appropriately
    const createResult = await client.createChannel({
        channel: channel as Parameters<typeof client.createChannel>[0]['channel'],
        unsignedInitialState,
        serverSignature: server_signature,
    });

    const txHash = typeof createResult === 'string'
        ? createResult
        : (createResult as { txHash: `0x${string}` }).txHash;

    // Wait for transaction confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { channelId: channel_id, txHash };
}

// ============================================================================
// Channel Balance Checking
// ============================================================================

const CUSTODY_ABI_FRAGMENT = [
    {
        type: 'function',
        name: 'getChannelBalances',
        inputs: [
            { name: 'channelId', type: 'bytes32' },
            { name: 'tokens', type: 'address[]' },
        ],
        outputs: [{ name: 'balances', type: 'uint256[]' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getAccountsBalances',
        inputs: [
            { name: 'users', type: 'address[]' },
            { name: 'tokens', type: 'address[]' },
        ],
        outputs: [{ type: 'uint256[]' }],
        stateMutability: 'view',
    },
] as const;

/**
 * Get channel balance from custody contract
 */
export async function getChannelBalance(
    publicClient: PublicClient,
    custodyAddress: Address,
    channelId: `0x${string}`,
    token: Address
): Promise<bigint> {
    try {
        const balances = await publicClient.readContract({
            address: custodyAddress,
            abi: CUSTODY_ABI_FRAGMENT,
            functionName: 'getChannelBalances',
            args: [channelId, [token]],
        }) as bigint[];

        return balances[0] || 0n;
    } catch (error) {
        console.error('Error getting channel balance:', error);
        return 0n;
    }
}

/**
 * Get user custody balance
 */
export async function getUserCustodyBalance(
    publicClient: PublicClient,
    custodyAddress: Address,
    userAddress: Address,
    token: Address
): Promise<bigint> {
    try {
        const balances = await publicClient.readContract({
            address: custodyAddress,
            abi: CUSTODY_ABI_FRAGMENT,
            functionName: 'getAccountsBalances',
            args: [[userAddress], [token]],
        }) as bigint[];

        return balances[0] || 0n;
    } catch (error) {
        console.error('Error getting user custody balance:', error);
        return 0n;
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Wait for node to index the channel
 */
export async function waitForChannelIndexing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, TIMING.channelIndexDelay));
}
