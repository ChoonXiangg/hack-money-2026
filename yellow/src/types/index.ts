import type { PublicClient, WalletClient, Hash, Address } from 'viem';
import type { NitroliteClient } from '@erc7824/nitrolite';

// ============================================================================
// Configuration Types
// ============================================================================

export interface YellowConfig {
    clearNodeUrl: string;
    chainId: number;
    rpcUrl: string;
    contracts: {
        custody: Address;
        adjudicator: Address;
    };
    asset: {
        symbol: string;
        decimals: number;
    };
}

export interface RPCAsset {
    token: Address;
    chain_id: number;
    symbol: string;
    decimals: number;
}

export interface RPCNetworkInfo {
    chain_id: number;
    name: string;
    rpc_url?: string;
}

export interface ClearNodeConfig {
    assets?: RPCAsset[];
    networks?: RPCNetworkInfo[];
    [key: string]: unknown;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthParams {
    session_key: Address;
    allowances: Array<{
        asset: string;
        amount: string;
    }>;
    expires_at: bigint;
    scope: string;
}

export interface AuthState {
    isAuthenticated: boolean;
    sessionKey: Address | null;
    mainWalletAddress: Address | null;
    jwtToken: string | null;
}

// ============================================================================
// Channel Types
// ============================================================================

export interface ChannelAllocation {
    destination: Address;
    token: Address;
    amount: bigint;
}

export interface ChannelState {
    intent: string;
    version: bigint;
    data: `0x${string}`;
    allocations: ChannelAllocation[];
}

export interface Channel {
    channel_id: `0x${string}`;
    status: 'open' | 'closed' | 'pending';
    amount: string;
    token: Address;
    chain_id: number;
}

export interface CreateChannelResponse {
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
}

export interface ResizeChannelResponse {
    channel_id: `0x${string}`;
    state: {
        intent: string;
        version: string;
        state_data?: `0x${string}`;
        data?: `0x${string}`;
        allocations: Array<{
            destination: Address;
            token: Address;
            amount: string;
        }>;
    };
    server_signature: `0x${string}`;
}

export interface CloseChannelResponse {
    channel_id: `0x${string}`;
    state: {
        intent: string;
        version: string;
        state_data?: `0x${string}`;
        data?: `0x${string}`;
        allocations: Array<{
            destination: Address;
            token: Address;
            amount: string;
        }>;
    };
    server_signature: `0x${string}`;
}

// ============================================================================
// App Session Types (for 2-party sessions with explicit fund distribution)
// ============================================================================

export interface AppSessionAllocation {
    participant: Address;
    asset: string;
    amount: string;
}

export interface AppSessionDefinition {
    application: string;
    protocol: 'NitroRPC/0.2' | 'NitroRPC/0.4';
    participants: Address[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce?: number;
}

export interface CreateAppSessionResponse {
    app_session_id: `0x${string}`;
    definition: AppSessionDefinition;
    allocations: AppSessionAllocation[];
    session_data?: string;
}

export interface CloseAppSessionResponse {
    app_session_id: `0x${string}`;
    allocations: AppSessionAllocation[];
    final_state?: {
        version: number;
        allocations: AppSessionAllocation[];
    };
}

// ============================================================================
// Session Types
// ============================================================================

export interface PlayEvent {
    songId: string;
    artistAddress: Address;
    startTime: number;
    endTime: number | null;
    durationSeconds: number;
    pricePerSecond: bigint;
    totalCost: bigint;
}

export interface SessionState {
    id: string;
    status: 'inactive' | 'starting' | 'active' | 'ending' | 'ended';
    channelId: `0x${string}` | null;
    startedAt: number | null;
    endedAt: number | null;
    depositAmount: bigint;
    currentBalance: bigint;
    totalSpent: bigint;
    playHistory: PlayEvent[];
    artistTotals: Map<Address, bigint>;
}

export interface SessionSummary {
    sessionId: string;
    duration: number;
    totalSpent: bigint;
    songsPlayed: number;
    artistPayments: Array<{
        artistAddress: Address;
        amount: bigint;
    }>;
    refundAmount: bigint;
}

// ============================================================================
// Song & Artist Types (for tracking)
// ============================================================================

export interface Artist {
    id: string;
    name: string;
    walletAddress: Address;
}

/** Collaborator as defined in songs.json */
export interface Collaborator {
    artistName: string;
    address: Address;
    blockchain: string;
    percentage?: number;  // Optional - defaults to equal split
}

/** Song structure matching songs.json */
export interface Song {
    id: string;
    songName: string;
    pricePerSecond: string;  // String in JSON, convert to bigint when needed
    collaborators: Collaborator[];
    songFile?: string;
    imageFile?: string;
    createdAt?: string;
}

/** Legacy Song type for backwards compatibility */
export interface LegacySong {
    id: string;
    title: string;
    artist: Artist;
    durationSeconds: number;
    pricePerSecond: bigint;
}

// ============================================================================
// Listening Activity Types (for relayer payouts)
// ============================================================================

/** Individual song listening record - simple structure for relayer to calculate artist splits */
export interface SongListeningRecord {
    songListened: string;   // songId from songs.json
    amountSpent: bigint;    // Total amount spent on this song
}

/**
 * Complete listening activity for a session
 * This is the key data structure passed to relayer for artist payouts
 *
 * Example output:
 * [
 *   { songListened: "song-1770332338689", amountSpent: 500n },
 *   { songListened: "song-1770385109288", amountSpent: 300n },
 * ]
 */
export type ListeningActivity = SongListeningRecord[];

// ============================================================================
// Service Types
// ============================================================================

export interface YellowServiceState {
    config: ClearNodeConfig | null;
    auth: AuthState;
    session: SessionState;
    channelToken: Address | null;
}

export interface TransferResult {
    success: boolean;
    destination: Address;
    amount: bigint;
    timestamp: number;
}

export interface SettlementResult {
    success: boolean;
    transfers: TransferResult[];
    closeTxHash: Hash | null;
    refundAmount: bigint;
    withdrawTxHash: Hash | null;
    /** On-chain transfer to relayer for cross-chain artist payments */
    relayerTransfer?: TransferResult | null;
    /** Session info for relayer to process refunds */
    sessionInfo?: {
        userAddress: Address;
        depositAmount: bigint;
        totalSpent: bigint;
        refundDue: bigint;
    };
    /** Listening activity for relayer to distribute to artists */
    listeningActivity?: ListeningActivity;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WSMessageType =
    | 'auth_challenge'
    | 'auth_verify'
    | 'channels'
    | 'create_channel'
    | 'resize_channel'
    | 'transfer'
    | 'close_channel'
    | 'get_ledger_balances'
    | 'error';

export interface WSResponse {
    res?: [string, WSMessageType, unknown, number?];
    error?: {
        code: number;
        message: string;
    };
}

// ============================================================================
// Event Emitter Types
// ============================================================================

export interface YellowServiceEvents {
    'connected': () => void;
    'disconnected': () => void;
    'authenticated': (state: AuthState) => void;
    'session:started': (session: SessionState) => void;
    'session:updated': (session: SessionState) => void;
    'session:ended': (summary: SessionSummary) => void;
    'channel:created': (channelId: `0x${string}`) => void;
    'channel:funded': (channelId: `0x${string}`, amount: bigint) => void;
    'channel:closed': (channelId: `0x${string}`, txHash: Hash) => void;
    'transfer:completed': (result: TransferResult) => void;
    'error': (error: Error) => void;
}
