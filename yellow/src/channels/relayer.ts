import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import { sepolia } from 'viem/chains';
import { RELAYER_ADDRESS, formatUSDCDisplay, TIMING } from '../config';

// ============================================================================
// ERC20 ABI Fragment for transfer
// ============================================================================

const ERC20_TRANSFER_ABI = [
    {
        type: 'function',
        name: 'transfer',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const;

// ============================================================================
// Relayer Transfer Types
// ============================================================================

export interface RelayerTransferParams {
    walletClient: WalletClient;
    publicClient: PublicClient;
    tokenAddress: Address;
    amount: bigint;
    relayerAddress?: Address;
}

export interface RelayerTransferResult {
    success: boolean;
    txHash: Hash | null;
    amount: bigint;
    relayerAddress: Address;
    error?: string;
}

// ============================================================================
// Relayer Transfer Functions
// ============================================================================

/**
 * Check token balance for an address
 */
export async function getTokenBalance(
    publicClient: PublicClient,
    tokenAddress: Address,
    accountAddress: Address
): Promise<bigint> {
    try {
        const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'balanceOf',
            args: [accountAddress],
        });
        return balance as bigint;
    } catch (error) {
        console.error('Error getting token balance:', error);
        return 0n;
    }
}

/**
 * Transfer tokens to the relayer address (on-chain ERC20 transfer)
 * This is the main function to send spent session funds to the relayer
 */
export async function transferToRelayer(
    params: RelayerTransferParams
): Promise<RelayerTransferResult> {
    const {
        walletClient,
        publicClient,
        tokenAddress,
        amount,
        relayerAddress = RELAYER_ADDRESS,
    } = params;

    // Don't transfer if amount is 0
    if (amount <= 0n) {
        return {
            success: true,
            txHash: null,
            amount: 0n,
            relayerAddress,
            error: 'No amount to transfer',
        };
    }

    const account = walletClient.account;
    if (!account) {
        return {
            success: false,
            txHash: null,
            amount,
            relayerAddress,
            error: 'No account connected to wallet client',
        };
    }

    console.log(`Transferring ${formatUSDCDisplay(amount)} to relayer...`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Relayer: ${relayerAddress}`);
    console.log(`  Amount: ${amount.toString()} units`);

    try {
        // Poll for balance with retries (blockchain state may take time to propagate)
        let balance = 0n;
        const maxRetries = TIMING.maxBalanceRetries;
        const pollInterval = TIMING.balancePollingInterval;

        for (let retry = 0; retry < maxRetries; retry++) {
            balance = await getTokenBalance(publicClient, tokenAddress, account.address);
            console.log(`  User balance: ${balance.toString()} units (attempt ${retry + 1}/${maxRetries})`);

            if (balance >= amount) {
                break;
            }

            if (retry < maxRetries - 1) {
                console.log(`  Waiting for balance to update...`);
                await new Promise((r) => setTimeout(r, pollInterval));
            }
        }

        if (balance < amount) {
            return {
                success: false,
                txHash: null,
                amount,
                relayerAddress,
                error: `Insufficient balance after ${maxRetries} attempts: have ${balance}, need ${amount}`,
            };
        }

        // Execute the transfer
        const hash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [relayerAddress, amount],
            chain: sepolia,
            account,
        });

        console.log(`  Transaction submitted: ${hash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            console.log(`✓ Transfer confirmed: ${hash}`);
            return {
                success: true,
                txHash: hash,
                amount,
                relayerAddress,
            };
        } else {
            return {
                success: false,
                txHash: hash,
                amount,
                relayerAddress,
                error: 'Transaction reverted',
            };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`✗ Transfer failed: ${errorMessage}`);
        return {
            success: false,
            txHash: null,
            amount,
            relayerAddress,
            error: errorMessage,
        };
    }
}

/**
 * Get the configured relayer address
 */
export function getRelayerAddress(): Address {
    return RELAYER_ADDRESS;
}
