/**
 * Test Script: Pay Artists from Arc Hub via Circle Gateway
 *
 * This script:
 * 1. Deposits USDC to Gateway Wallet on Arc
 * 2. Pays artists from Arc to their respective chains
 *
 * Run: npx tsx scripts/test-arc-hub-payments.ts
 */

import 'dotenv/config';
import { gatewayTransfer, depositToGateway, formatUSDC, getChainBalance, getGatewayBalance, USDC_ADDRESSES } from '../src/gateway';
import type { Address, Hex } from 'viem';

// ============================================================================
// Configuration
// ============================================================================

// Relayer wallet (same address on all EVM chains, derived from EVM_PRIVATE_KEY)
const RELAYER = '0xC0df42b03E9438dc744935578B4FA90344937FC6' as Address;

// Artists from "Dive By Night" song
const ARTISTS = [
    {
        name: 'Trellion',
        address: '0xda29bf5e13cc0a808baa3a435f4e3fbfece8bb6f' as Address,
        blockchain: 'Ethereum_Sepolia',
    },
    {
        name: 'Kendrick',
        address: '0x0f19f1f7e413af44b79e30c1cc4a07a25f4eee03' as Address,
        blockchain: 'Arc_Testnet',
    },
];

const TEST_AMOUNT = '0.01'; // 0.01 USDC per artist

async function main() {
    console.log('='.repeat(60));
    console.log('ARC HUB - ARTIST PAYMENTS TEST');
    console.log('='.repeat(60));
    console.log('');

    // Pre-flight: check balances
    console.log('Pre-flight Checks:');
    console.log('-'.repeat(40));

    try {
        const arcBalance = await getChainBalance('Arc_Testnet', RELAYER);
        console.log(`  Relayer Arc USDC: ${formatUSDC(arcBalance)}`);
    } catch (e) {
        console.log(`  Relayer Arc USDC: Error fetching balance`);
    }

    const totalForArtists = parseFloat(TEST_AMOUNT) * ARTISTS.length;
    console.log(`\n  Amount per artist: ${TEST_AMOUNT} USDC`);
    console.log(`  Total for artists: ${totalForArtists} USDC`);
    console.log('');

    // ========================================================================
    // STEP 0: Deposit USDC to Gateway Wallet on Arc
    // ========================================================================
    console.log('='.repeat(60));
    console.log('STEP 0: DEPOSIT TO GATEWAY WALLET ON ARC');
    console.log('='.repeat(60));

    try {
        const gwBalance = await getGatewayBalance('Arc_Testnet', RELAYER);
        console.log(`  Current Gateway balance (Arc): ${formatUSDC(gwBalance.available)} USDC`);

        const neededWei = BigInt(Math.ceil(totalForArtists * 1_000_000));
        if (gwBalance.available >= neededWei) {
            console.log('  ✓ Already have enough in Gateway Wallet, skipping deposit');
        } else {
            const depositAmount = (totalForArtists + 0.01).toFixed(6); // small buffer
            console.log(`  Depositing ${depositAmount} USDC to Gateway on Arc...`);
            const depositResult = await depositToGateway('Arc_Testnet', depositAmount);
            console.log('  ✓ Deposit successful!');
            console.log(`    Approval TX: ${depositResult.approvalTxHash}`);
            console.log(`    Deposit TX: ${depositResult.depositTxHash}`);
            console.log(`    Explorer: https://testnet.arcscan.app/tx/${depositResult.depositTxHash}`);
        }
    } catch (error) {
        console.log(`  ✗ Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('Aborting test - Gateway deposit failed.');
        process.exit(1);
    }

    console.log('');

    // ========================================================================
    // STEP 1: Pay Artists from Arc
    // ========================================================================
    console.log('='.repeat(60));
    console.log('STEP 1: PAY ARTISTS FROM ARC');
    console.log('='.repeat(60));
    console.log('');

    const artistPayments: Array<{
        name: string;
        address: string;
        blockchain: string;
        amount: string;
        txHash: Hex | null;
        error?: string;
    }> = [];

    for (const artist of ARTISTS) {
        console.log(`  Artist: ${artist.name}`);
        console.log(`    Address: ${artist.address}`);
        console.log(`    Blockchain: ${artist.blockchain}`);
        console.log(`    Amount: ${TEST_AMOUNT} USDC`);

        // All payments go through Gateway from Arc
        console.log(`    → Gateway transfer: Arc_Testnet → ${artist.blockchain}`);

        try {
            const result = await gatewayTransfer(
                'Arc_Testnet',
                artist.blockchain,
                TEST_AMOUNT,
                artist.address
            );

            console.log('    ✓ Payment successful!');
            console.log(`    TX: ${result.mintTxHash}`);

            if (artist.blockchain === 'Ethereum_Sepolia') {
                console.log(`    Explorer: https://sepolia.etherscan.io/tx/${result.mintTxHash}`);
            } else {
                console.log(`    Explorer: https://testnet.arcscan.app/tx/${result.mintTxHash}`);
            }

            artistPayments.push({
                name: artist.name,
                address: artist.address,
                blockchain: artist.blockchain,
                amount: TEST_AMOUNT,
                txHash: result.mintTxHash,
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.log(`    ✗ Payment failed: ${errorMsg}`);
            artistPayments.push({
                name: artist.name,
                address: artist.address,
                blockchain: artist.blockchain,
                amount: TEST_AMOUNT,
                txHash: null,
                error: errorMsg,
            });
        }
        console.log('');
    }

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log('');
    console.log('Artist Payments:');
    for (const payment of artistPayments) {
        const status = payment.txHash ? '✓' : '✗';
        console.log(`  ${status} ${payment.name} (${payment.blockchain}): ${payment.amount} USDC`);
        if (payment.txHash) {
            console.log(`    TX: ${payment.txHash}`);
        }
        if (payment.error) {
            console.log(`    Error: ${payment.error}`);
        }
    }
    console.log('');
    console.log('='.repeat(60));
}

main().catch(console.error);
