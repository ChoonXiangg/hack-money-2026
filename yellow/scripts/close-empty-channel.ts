/**
 * Close empty/stuck channels
 *
 * This script closes channels that have 0 balance and are stuck in 'open' state
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
    console.log('Close Empty/Stuck Channels');
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
        process.exit(0);
    }

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
            console.log(`  Last state version: ${data.lastValidState.version}`);

            // If balance is 0, this channel is stuck/empty
            if (balance === 0n) {
                console.log('  This channel has 0 balance - attempting to close...');

                try {
                    // Try to close the channel on-chain directly
                    // Since there are no funds, this should be safe
                    const closeTxHash = await nitroliteClient.closeChannel({
                        finalState: data.lastValidState,
                        proofStates: [],
                    });

                    console.log(`  Close TX: ${closeTxHash}`);

                    // Wait for confirmation
                    const receipt = await publicClient.waitForTransactionReceipt({
                        hash: closeTxHash,
                    });

                    if (receipt.status === 'success') {
                        console.log('  ✓ Channel closed successfully');
                    } else {
                        console.log('  ✗ Close transaction failed');
                    }
                } catch (closeErr) {
                    console.log(`  Could not close: ${closeErr}`);
                    console.log('  (This may require going through ClearNode)');
                }
            }
        } catch (err) {
            console.log(`  Error: ${err}`);
        }

        console.log('');
    }

    process.exit(0);
}

main().catch(console.error);
