/**
 * Check all open channels and their balances
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

async function main() {
    console.log('='.repeat(60));
    console.log('Check Open Channels');
    console.log('='.repeat(60));

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://1rpc.io/sepolia';
    const account = privateKeyToAccount(privateKey);

    console.log(`User: ${account.address}`);
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

    // Get open channels
    console.log('Fetching open channels...\n');
    const openChannels = await nitroliteClient.getOpenChannels();

    if (openChannels.length === 0) {
        console.log('No open channels found.');
    } else {
        console.log(`Found ${openChannels.length} open channel(s):\n`);

        for (const channelId of openChannels) {
            console.log(`Channel: ${channelId}`);

            try {
                // Get channel balance
                const balance = await nitroliteClient.getChannelBalance(channelId, DEFAULT_TOKEN_ADDRESS);
                console.log(`  Balance: ${formatUSDCDisplay(balance)} (${balance} units)`);

                // Get channel data
                const data = await nitroliteClient.getChannelData(channelId);
                console.log(`  Status: ${data.status}`);
                console.log(`  Challenge expiry: ${data.challengeExpiry}`);
                console.log(`  Last state version: ${data.lastValidState.version}`);
                console.log('  Allocations:');
                for (const alloc of data.lastValidState.allocations) {
                    console.log(`    ${alloc.destination}: ${formatUSDCDisplay(alloc.amount)}`);
                }
            } catch (err) {
                console.log(`  Error getting channel data: ${err}`);
            }

            console.log('');
        }
    }

    // Also check account balance directly via client
    console.log('='.repeat(60));
    console.log('Account Balance (via NitroliteClient):');
    const accountBalance = await nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
    console.log(`  ${formatUSDCDisplay(accountBalance)} (${accountBalance} units)`);

    process.exit(0);
}

main().catch(console.error);
