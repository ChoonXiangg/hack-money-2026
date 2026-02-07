/**
 * Cleanup script to close all existing channels and withdraw funds
 * Run this before creating new app sessions
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import {
    DEFAULT_TOKEN_ADDRESS,
    CONTRACT_ADDRESSES,
    CLEARNODE_URLS,
    formatUSDCDisplay,
    getRpcUrl,
    SEPOLIA_CHAIN_ID,
} from '../src/config';

async function main() {
    console.log('='.repeat(60));
    console.log('Channel Cleanup Script');
    console.log('='.repeat(60));

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    const account = privateKeyToAccount(privateKey);
    const userAddress = account.address;

    console.log(`User: ${userAddress}`);
    console.log('');

    // Create clients
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(getRpcUrl()),
    });

    const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(getRpcUrl()),
    });

    const nitroliteClient = new NitroliteClient({
        publicClient,
        walletClient,
        stateSigner: new WalletStateSigner(walletClient),
        addresses: CONTRACT_ADDRESSES.sepolia,
        chainId: SEPOLIA_CHAIN_ID,
        challengeDuration: 3600n,
    });

    try {
        // Step 1: Check custody balance
        console.log('[Step 1] Checking custody balance...');
        const custodyBalance = await nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
        console.log(`  Custody balance: ${formatUSDCDisplay(custodyBalance)}`);

        // Step 2: Get open channels
        console.log('\n[Step 2] Checking for open channels...');
        const openChannels = await nitroliteClient.getOpenChannels();
        console.log(`  Found ${openChannels.length} open channel(s)`);

        // Step 3: Close each channel with funds
        if (openChannels.length > 0) {
            console.log('\n[Step 3] Closing channels...');
            for (const channelId of openChannels) {
                console.log(`\n  Channel: ${channelId}`);
                try {
                    // Check channel balance
                    const channelBalance = await nitroliteClient.getChannelBalance(
                        channelId,
                        DEFAULT_TOKEN_ADDRESS
                    );
                    console.log(`    Balance: ${formatUSDCDisplay(channelBalance)}`);

                    if (channelBalance > 0n) {
                        console.log('    Closing channel with funds...');

                        // Get channel data for closing
                        const channelData = await nitroliteClient.getChannelData(channelId);
                        console.log('    Channel data retrieved');

                        // Close channel (this will move funds to custody)
                        const closeTxHash = await nitroliteClient.closeChannel({
                            channelId,
                            finalState: {
                                channelNonce: channelData.channelNonce,
                                outcome: {
                                    asset: DEFAULT_TOKEN_ADDRESS,
                                    assetMetadata: {
                                        assetType: 0,
                                        metadata: '0x',
                                    },
                                    allocations: [
                                        {
                                            destination: userAddress,
                                            amount: channelBalance,
                                            allocationType: 0,
                                            metadata: '0x',
                                        },
                                    ],
                                },
                                appData: '0x',
                                isFinal: true,
                            } as any,
                        });

                        console.log(`    ✓ Close TX: ${closeTxHash}`);
                        await publicClient.waitForTransactionReceipt({ hash: closeTxHash });
                        console.log('    ✓ Channel closed');
                    } else {
                        console.log('    Channel has no funds, skipping');
                    }
                } catch (err: any) {
                    console.log(`    ⚠ Error closing channel: ${err.message || err}`);
                }
            }
        } else {
            console.log('\n[Step 3] No channels to close');
        }

        // Step 4: Withdraw all custody funds
        console.log('\n[Step 4] Withdrawing remaining custody funds...');
        const finalCustodyBalance = await nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
        console.log(`  Current custody balance: ${formatUSDCDisplay(finalCustodyBalance)}`);

        if (finalCustodyBalance > 0n) {
            console.log('  Withdrawing all funds...');
            const withdrawTxHash = await nitroliteClient.withdrawal(
                DEFAULT_TOKEN_ADDRESS,
                finalCustodyBalance
            );
            console.log(`  ✓ Withdrawal TX: ${withdrawTxHash}`);
            await publicClient.waitForTransactionReceipt({ hash: withdrawTxHash });
            console.log('  ✓ Withdrawal confirmed');
        } else {
            console.log('  No funds to withdraw');
        }

        // Step 5: Final balance check
        console.log('\n[Step 5] Final balance check...');
        const finalBalance = await nitroliteClient.getAccountBalance(DEFAULT_TOKEN_ADDRESS);
        console.log(`  Custody balance: ${formatUSDCDisplay(finalBalance)} (should be 0)`);

        console.log('\n' + '='.repeat(60));
        console.log('CLEANUP COMPLETE');
        console.log('='.repeat(60));
        console.log('\nYou can now create new app sessions.');

        process.exit(0);
    } catch (error: any) {
        console.error('\nCleanup failed:', error.message || error);
        process.exit(1);
    }
}

main();
