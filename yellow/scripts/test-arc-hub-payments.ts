/**
 * Test Script: Arc Liquidity Hub - Bridge and Artist Payments
 * 
 * This script tests:
 * 1. Bridge USDC from Sepolia (relayer) to Arc (hub wallet)
 * 2. Pay artists from Arc to their respective chains
 * 
 * Run: npx tsx scripts/test-arc-hub-payments.ts
 */

import 'dotenv/config';
import { gatewayTransfer, depositToGateway, formatUSDC, getChainBalance, getGatewayBalance, USDC_ADDRESSES } from '../src/gateway';
import type { Address, Hex } from 'viem';

// ============================================================================
// Configuration
// ============================================================================

// Relayer wallets
const RELAYER_SEPOLIA = '0xC0df42b03E9438dc744935578B4FA90344937FC6' as Address;
const RELAYER_ARC_HUB = '0x843b9ec5c49092bbf874acbacb397d2c252e36a4' as Address;

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

// Test amount (Gateway requires minimum ~2 USDC per transfer)
const TEST_AMOUNT = '2.5'; // 2.5 USDC per artist

async function main() {
    console.log('='.repeat(60));
    console.log('ARC LIQUIDITY HUB TEST');
    console.log('='.repeat(60));
    console.log('');

    // Check initial balances
    console.log('Pre-flight Checks:');
    console.log('-'.repeat(40));

    try {
        const sepoliaBalance = await getChainBalance('Ethereum_Sepolia', RELAYER_SEPOLIA);
        console.log(`  Relayer Sepolia USDC: ${formatUSDC(sepoliaBalance)}`);
    } catch (e) {
        console.log(`  Relayer Sepolia USDC: Error fetching balance`);
    }

    // Calculate total needed (amount + fee)
    const totalForArtists = parseFloat(TEST_AMOUNT) * ARTISTS.length;
    const feeBuffer = 3; // 3 USDC buffer for fees
    const totalNeeded = totalForArtists + feeBuffer;
    console.log(`\n  Total for artists: ${totalForArtists} USDC`);
    console.log(`  Fee buffer: ${feeBuffer} USDC`);
    console.log(`  Total to deposit: ${totalNeeded} USDC`);
    console.log('');

    // ========================================================================
    // STEP 0: Deposit USDC to Gateway Wallet on Sepolia
    // ========================================================================
    console.log('='.repeat(60));
    console.log('STEP 0: DEPOSIT TO GATEWAY WALLET');
    console.log('='.repeat(60));
    console.log(`  Depositing ${totalNeeded} USDC to Gateway Wallet on Sepolia...`);
    console.log('');

    try {
        // Check current Gateway balance first
        const gwBalance = await getGatewayBalance('Ethereum_Sepolia', RELAYER_SEPOLIA);
        console.log(`  Current Gateway balance: ${formatUSDC(gwBalance.available)} USDC`);

        // Only deposit if needed
        const neededWei = BigInt(Math.ceil(totalNeeded * 1_000_000));
        if (gwBalance.available >= neededWei) {
            console.log('  ✓ Already have enough in Gateway Wallet, skipping deposit');
        } else {
            const depositResult = await depositToGateway('Ethereum_Sepolia', totalNeeded.toString());
            console.log('  ✓ Deposit successful!');
            console.log(`    Approval TX: ${depositResult.approvalTxHash}`);
            console.log(`    Deposit TX: ${depositResult.depositTxHash}`);
            console.log(`    Explorer: https://sepolia.etherscan.io/tx/${depositResult.depositTxHash}`);
        }
    } catch (error) {
        console.log(`  ✗ Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('');
        console.log('Aborting test - Gateway deposit failed.');
        process.exit(1);
    }

    console.log('');

    // ========================================================================
    // STEP 1: Bridge from Sepolia to Arc Hub
    // ========================================================================
    console.log('='.repeat(60));
    console.log('STEP 1: BRIDGE TO ARC HUB');
    console.log('='.repeat(60));
    console.log(`  Source: Ethereum_Sepolia (${RELAYER_SEPOLIA})`);
    console.log(`  Destination: Arc_Testnet (${RELAYER_ARC_HUB})`);
    console.log(`  Amount: ${totalForArtists} USDC`);
    console.log('');

    let hubBridgeTxHash: Hex | null = null;

    try {
        console.log('  Initiating Gateway transfer...');
        const bridgeResult = await gatewayTransfer(
            'Ethereum_Sepolia',
            'Arc_Testnet',
            totalForArtists.toString(),
            RELAYER_ARC_HUB
        );

        hubBridgeTxHash = bridgeResult.mintTxHash;
        console.log('  ✓ Bridge successful!');
        console.log('');
        console.log('  Transaction Details:');
        console.log(`    Burn Intent Signature: ${bridgeResult.burnIntentSignature.slice(0, 20)}...`);
        console.log(`    Attestation: ${bridgeResult.attestation.slice(0, 20)}...`);
        console.log(`    Operator Signature: ${bridgeResult.operatorSignature.slice(0, 20)}...`);
        console.log(`    🔗 MINT TX HASH (Arc): ${bridgeResult.mintTxHash}`);
        console.log(`    Explorer: https://testnet.arcscan.app/tx/${bridgeResult.mintTxHash}`);
    } catch (error) {
        console.log(`  ✗ Bridge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('');
        console.log('Aborting test - hub bridge failed.');
        process.exit(1);
    }

    console.log('');

    // ========================================================================
    // STEP 2: Pay Artists from Arc Hub
    // ========================================================================
    console.log('='.repeat(60));
    console.log('STEP 2: PAY ARTISTS FROM ARC HUB');
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

        if (artist.blockchain === 'Arc_Testnet') {
            // Native Arc payment - artist is on Arc, funds already there
            console.log('    → Native Arc payment (funds already on Arc hub)');
            console.log('    ✓ No additional transfer needed');
            console.log(`    (Reference: Hub TX ${hubBridgeTxHash?.slice(0, 20)}...)`);
            artistPayments.push({
                name: artist.name,
                address: artist.address,
                blockchain: artist.blockchain,
                amount: TEST_AMOUNT,
                txHash: hubBridgeTxHash, // Reference hub TX
            });
        } else {
            // Cross-chain from Arc to other chain
            console.log(`    → Cross-chain: Arc_Testnet → ${artist.blockchain}`);

            try {
                const result = await gatewayTransfer(
                    'Arc_Testnet',
                    artist.blockchain,
                    TEST_AMOUNT,
                    artist.address
                );

                console.log('    ✓ Payment successful!');
                console.log(`    🔗 MINT TX HASH: ${result.mintTxHash}`);

                if (artist.blockchain === 'Ethereum_Sepolia') {
                    console.log(`    Explorer: https://sepolia.etherscan.io/tx/${result.mintTxHash}`);
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
    console.log('Hub Bridge (Sepolia → Arc):');
    console.log(`  TX Hash: ${hubBridgeTxHash}`);
    console.log(`  Amount: ${totalForArtists} USDC`);
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
