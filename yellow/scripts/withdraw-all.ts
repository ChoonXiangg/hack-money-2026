/**
 * Withdraw all funds from custody to wallet
 *
 * Usage:
 *   npx tsx scripts/withdraw-all.ts
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import {
    CONTRACT_ADDRESSES,
    DEFAULT_TOKEN_ADDRESS,
    formatUSDCDisplay,
    SESSION_CONFIG,
    SEPOLIA_CHAIN_ID
} from '../src/config';
import { getTokenBalance } from '../src/channels/relayer';

async function main() {
    console.log('='.repeat(60));
    console.log('Withdraw All from Custody');
    console.log('='.repeat(60));

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://1rpc.io/sepolia';
    const account = privateKeyToAccount(privateKey);

    console.log(`User: ${account.address}`);
    console.log(`Token: ${DEFAULT_TOKEN_ADDRESS}`);
    console.log('');

    // Create clients
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
        chain: sepolia,
        transport: http(rpcUrl),
        account,
    });

    const nitroliteClient = new NitroliteClient({
        publicClient,
        walletClient,
        stateSigner: new WalletStateSigner(walletClient),
        addresses: CONTRACT_ADDRESSES.sepolia,
        chainId: SEPOLIA_CHAIN_ID,
        challengeDuration: SESSION_CONFIG.challengeDuration,
    });

    // Check current balances
    const walletBalance = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, account.address);

    // Use NitroliteClient's getAccountBalance for accurate custody balance
    const custodyBalance = await nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

    console.log('Current balances:');
    console.log(`  Wallet (ERC20): ${formatUSDCDisplay(walletBalance)} (${walletBalance} units)`);
    console.log(`  Custody: ${formatUSDCDisplay(custodyBalance)} (${custodyBalance} units)`);
    console.log('');

    if (custodyBalance <= 0n) {
        console.log('No funds in custody to withdraw.');
        process.exit(0);
    }

    // Withdraw all from custody
    console.log(`Withdrawing ${formatUSDCDisplay(custodyBalance)} from custody...`);

    try {
        const txHash = await nitroliteClient.withdrawal(DEFAULT_TOKEN_ADDRESS, custodyBalance);
        console.log(`  TX: ${txHash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === 'success') {
            console.log('✓ Withdrawal confirmed!');
        } else {
            console.log('✗ Withdrawal failed (transaction reverted)');
        }

        // Check new balances
        await new Promise(r => setTimeout(r, 2000));

        const newWalletBalance = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, account.address);
        const newCustodyBalance = await nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);

        console.log('');
        console.log('New balances:');
        console.log(`  Wallet (ERC20): ${formatUSDCDisplay(newWalletBalance)} (${newWalletBalance} units)`);
        console.log(`  Custody: ${formatUSDCDisplay(newCustodyBalance)} (${newCustodyBalance} units)`);

    } catch (err) {
        console.error('Withdrawal failed:', err);
        process.exit(1);
    }

    process.exit(0);
}

main().catch(console.error);
