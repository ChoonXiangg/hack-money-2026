import { sepolia } from 'viem/chains';
import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { YellowConfig } from './types';

// ============================================================================
// Network Configuration
// ============================================================================

export const SEPOLIA_CHAIN_ID = sepolia.id; // 11155111

export const RPC_URLS = {
    sepolia: {
        primary: process.env.ALCHEMY_RPC_URL || process.env.SEPOLIA_RPC_URL,
        fallback: 'https://1rpc.io/sepolia',
    },
} as const;

export function getRpcUrl(chainId: number = SEPOLIA_CHAIN_ID): string {
    if (chainId === SEPOLIA_CHAIN_ID) {
        return RPC_URLS.sepolia.primary || RPC_URLS.sepolia.fallback;
    }
    throw new Error(`Unsupported chain ID: ${chainId}`);
}

// ============================================================================
// Yellow Network Configuration
// ============================================================================

export const CLEARNODE_URLS = {
    sandbox: 'wss://clearnet-sandbox.yellow.com/ws',
    production: 'wss://clearnet.yellow.com/ws',
} as const;

export const CONTRACT_ADDRESSES = {
    sepolia: {
        custody: '0x019B65A265EB3363822f2752141b3dF16131b262' as Address,
        adjudicator: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2' as Address,
    },
} as const;

// Default token for Sepolia (ytest.usd - represents USDC for demo)
export const DEFAULT_TOKEN_ADDRESS = '0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb' as Address;

// ============================================================================
// Relayer Configuration
// ============================================================================

// Relayer wallet address - derived from RELAYER_PRIVATE_KEY in .env
// This address handles cross-chain distribution to artists via Circle CCTP
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
if (!RELAYER_PRIVATE_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY is required in .env file');
}
export const RELAYER_ADDRESS = privateKeyToAccount(RELAYER_PRIVATE_KEY).address as Address;

// ============================================================================
// Asset Configuration
// ============================================================================

// Token decimals (ytest.usd and USDC both use 6 decimals)
export const TOKEN_DECIMALS = 6;

export const SUPPORTED_ASSETS = {
    'ytest.usd': {
        symbol: 'USDC', // Display as USDC (ytest.usd represents USDC in sandbox)
        internalSymbol: 'ytest.usd', // Internal Yellow Network symbol
        decimals: TOKEN_DECIMALS,
        // 1 USDC = 1,000,000 units (6 decimals)
    },
} as const;

// ============================================================================
// USDC Formatting Utilities
// ============================================================================

/**
 * Convert raw units to USDC decimal string
 * Example: 1000000n -> "1.000000"
 */
export function formatUSDC(units: bigint, decimals: number = TOKEN_DECIMALS): string {
    const divisor = BigInt(10 ** decimals);
    const whole = units / divisor;
    const fraction = units % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    return `${whole}.${fractionStr}`;
}

/**
 * Convert raw units to human-readable USDC string
 * Example: 1000000n -> "1.00 USDC"
 */
export function formatUSDCDisplay(units: bigint, showDecimals: number = 4): string {
    const formatted = formatUSDC(units);
    const [whole, fraction] = formatted.split('.');
    const truncatedFraction = fraction.slice(0, showDecimals);
    return `${whole}.${truncatedFraction} USDC`;
}

/**
 * Parse USDC decimal string to raw units
 * Example: "1.5" -> 1500000n
 */
export function parseUSDC(amount: string, decimals: number = TOKEN_DECIMALS): bigint {
    const [whole, fraction = ''] = amount.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedFraction);
}

// Default price per second for songs (in smallest units)
// 0.0001 ytest.usd per second = 100 units (with 6 decimals)
export const DEFAULT_PRICE_PER_SECOND = 100n;

// ============================================================================
// Session Configuration
// ============================================================================

export const SESSION_CONFIG = {
    // Maximum session duration in seconds (1 hour)
    maxDurationSeconds: 3600,

    // Default deposit amount (in smallest units)
    // 10 ytest.usd = 10,000,000 units
    defaultDepositAmount: 10_000_000n,

    // Minimum deposit amount
    // 1 ytest.usd = 1,000,000 units
    minDepositAmount: 1_000_000n,

    // Challenge duration for channels (in seconds)
    challengeDuration: 3600n,

    // Application name for auth
    applicationName: 'MusicStream',

    // Auth scope
    authScope: 'music.stream',

    // Session expiry (in seconds from now)
    sessionExpirySeconds: 3600,

    // Large allowance for session (1 billion units)
    maxAllowance: '1000000000',
} as const;

// ============================================================================
// Timing Configuration
// ============================================================================

export const TIMING = {
    // Delay after channel creation for node indexing (ms)
    channelIndexDelay: 5000,

    // Delay after resize for balance update (ms)
    resizeConfirmDelay: 2000,

    // Delay before withdrawal after close (ms)
    closeSettleDelay: 5000,

    // WebSocket message timeout (ms)
    wsMessageTimeout: 30000,

    // Polling interval for balance checks (ms)
    balancePollingInterval: 2000,

    // Max retries for balance polling
    maxBalanceRetries: 30,
} as const;

// ============================================================================
// Default Configuration Builder
// ============================================================================

export function createDefaultConfig(
    environment: 'sandbox' | 'production' = 'sandbox'
): YellowConfig {
    const clearNodeUrl = environment === 'sandbox'
        ? CLEARNODE_URLS.sandbox
        : CLEARNODE_URLS.production;

    return {
        clearNodeUrl,
        chainId: SEPOLIA_CHAIN_ID,
        rpcUrl: getRpcUrl(SEPOLIA_CHAIN_ID),
        contracts: CONTRACT_ADDRESSES.sepolia,
        asset: SUPPORTED_ASSETS['ytest.usd'],
    };
}

// ============================================================================
// Export Default Config
// ============================================================================

export const DEFAULT_CONFIG = createDefaultConfig('sandbox');
