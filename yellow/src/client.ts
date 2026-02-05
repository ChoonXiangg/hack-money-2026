import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { PublicClient, WalletClient, Address } from 'viem';
import { CONTRACT_ADDRESSES, getRpcUrl, SESSION_CONFIG, SEPOLIA_CHAIN_ID } from './config';

// ============================================================================
// Client Types
// ============================================================================

export interface ClientConfig {
    privateKey: `0x${string}`;
    rpcUrl?: string;
    chainId?: number;
}

export interface ClientBundle {
    publicClient: PublicClient;
    walletClient: WalletClient;
    nitroliteClient: NitroliteClient;
    account: {
        address: Address;
        privateKey: `0x${string}`;
    };
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create all necessary clients for Yellow Network interaction
 */
export function createClients(config: ClientConfig): ClientBundle {
    const { privateKey, chainId = SEPOLIA_CHAIN_ID } = config;
    const rpcUrl = config.rpcUrl || getRpcUrl(chainId);

    // Create account from private key
    const account = privateKeyToAccount(privateKey);

    // Create viem clients
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
        chain: sepolia,
        transport: http(rpcUrl),
        account,
    });

    // Create Nitrolite client
    const nitroliteClient = new NitroliteClient({
        publicClient,
        walletClient,
        stateSigner: new WalletStateSigner(walletClient),
        addresses: CONTRACT_ADDRESSES.sepolia,
        chainId,
        challengeDuration: SESSION_CONFIG.challengeDuration,
    });

    return {
        publicClient,
        walletClient,
        nitroliteClient,
        account: {
            address: account.address,
            privateKey,
        },
    };
}

/**
 * Validate a private key format
 */
export function isValidPrivateKey(key: string): key is `0x${string}` {
    if (!key) return false;
    const normalized = key.startsWith('0x') ? key : `0x${key}`;
    return /^0x[a-fA-F0-9]{64}$/.test(normalized);
}

/**
 * Normalize private key to 0x format
 */
export function normalizePrivateKey(key: string): `0x${string}` {
    if (!key) throw new Error('Private key is required');
    return key.startsWith('0x') ? key as `0x${string}` : `0x${key}` as `0x${string}`;
}
