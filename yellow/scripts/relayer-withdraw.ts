/**
 * Relayer Balance Check Script
 *
 * In the new flow, the relayer receives ERC20 tokens directly from users
 * when they end their sessions. This script:
 * 1. Checks the relayer's on-chain token balance
 * 2. Shows what's available for artist payments
 *
 * The relayer no longer needs to:
 * - Withdraw from custody (tokens come directly via ERC20 transfer)
 * - Send refunds to users (users keep their refund on-chain)
 *
 * Usage:
 *   npm run relayer:withdraw
 */

import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { formatUSDCDisplay, RELAYER_ADDRESS, DEFAULT_TOKEN_ADDRESS } from '../src/config';

// ERC20 ABI for balance checks
const ERC20_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view'
    }
] as const;

async function main() {
    console.log('='.repeat(60));
    console.log('Relayer Balance Check');
    console.log('='.repeat(60));
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);
    console.log(`Token: ${DEFAULT_TOKEN_ADDRESS}`);
    console.log('');

    // Verify relayer key if provided
    const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;

    if (RELAYER_PRIVATE_KEY) {
        const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);
        if (account.address.toLowerCase() !== RELAYER_ADDRESS.toLowerCase()) {
            console.warn(`⚠ Warning: Private key does not match configured relayer address`);
            console.warn(`  Configured: ${RELAYER_ADDRESS}`);
            console.warn(`  From key: ${account.address}`);
        } else {
            console.log('✓ Relayer address verified');
        }
    } else {
        console.log('ℹ No RELAYER_PRIVATE_KEY in .env (not required for balance check)');
    }

    // Setup client
    const RPC_URL = process.env.ALCHEMY_RPC_URL || 'https://1rpc.io/sepolia';
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL),
    });

    // Check on-chain balance
    console.log('\n[Checking On-Chain Balance]');

    const balance = await publicClient.readContract({
        address: DEFAULT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [RELAYER_ADDRESS],
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('RELAYER BALANCE');
    console.log('='.repeat(60));
    console.log(`  On-chain balance: ${formatUSDCDisplay(balance)}`);
    console.log(`  View on Etherscan: https://sepolia.etherscan.io/address/${RELAYER_ADDRESS}`);

    if (balance > 0n) {
        console.log(`\n✓ You have ${formatUSDCDisplay(balance)} ready for artist payments!`);
        console.log('\nNext steps:');
        console.log('  1. Query session data to get artist payment breakdown');
        console.log('  2. Use Circle CCTP to send payments to artists on their chains');
    } else {
        console.log('\nℹ No balance yet. Balance will increase when users end their sessions.');
    }

    process.exit(0);
}

main().catch(console.error);
