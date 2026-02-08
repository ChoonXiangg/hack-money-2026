/**
 * Test Script: Direct USDC Transfer on Arc Testnet
 * 
 * Tests the directTransfer function from listener wallet to Kendrick on Arc.
 * This verifies that native Arc USDC payments work correctly.
 * 
 * Listener wallet: 0xC0df42b03E9438dc744935578B4FA90344937FC6
 * Kendrick: 0x0F19F1F7e413AF44b79E30c1CC4A07a25f4eEE03
 * 
 * Run: npx tsx scripts/test-direct-arc-transfer.ts
 */

import 'dotenv/config';
import { directTransfer, getChainBalance, formatUSDC, USDC_ADDRESSES } from '../src/gateway';
import type { Address } from 'viem';

// ============================================================================
// Configuration
// ============================================================================

// Listener wallet (derived from EVM_PRIVATE_KEY)
const LISTENER_WALLET: Address = '0xC0df42b03E9438dc744935578B4FA90344937FC6';

// Kendrick's wallet on Arc
const KENDRICK_ADDRESS: Address = '0x0F19F1F7e413AF44b79E30c1CC4A07a25f4eEE03';

// Test amount - 0.0003 USDC (same as in the listening activity)
const TEST_AMOUNT = '0.000300';

async function main() {
    console.log('='.repeat(60));
    console.log('DIRECT ARC TRANSFER TEST');
    console.log('='.repeat(60));
    console.log('');
    console.log('Configuration:');
    console.log(`  From (Listener): ${LISTENER_WALLET}`);
    console.log(`  To (Kendrick): ${KENDRICK_ADDRESS}`);
    console.log(`  Amount: ${TEST_AMOUNT} USDC`);
    console.log(`  Chain: Arc_Testnet`);
    console.log(`  USDC Contract: ${USDC_ADDRESSES['Arc_Testnet']}`);
    console.log('');

    // Pre-flight: Check balances
    console.log('-'.repeat(60));
    console.log('PRE-FLIGHT BALANCE CHECK');
    console.log('-'.repeat(60));

    try {
        const listenerBalance = await getChainBalance('Arc_Testnet', LISTENER_WALLET);
        console.log(`  Listener USDC on Arc: ${formatUSDC(listenerBalance)} USDC`);
    } catch (e) {
        console.log(`  Listener USDC on Arc: ERROR - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    try {
        const kendrickBalance = await getChainBalance('Arc_Testnet', KENDRICK_ADDRESS);
        console.log(`  Kendrick USDC on Arc: ${formatUSDC(kendrickBalance)} USDC`);
    } catch (e) {
        console.log(`  Kendrick USDC on Arc: ERROR - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    console.log('');
    console.log('-'.repeat(60));
    console.log('EXECUTING DIRECT TRANSFER');
    console.log('-'.repeat(60));

    try {
        console.log(`  Transferring ${TEST_AMOUNT} USDC from Listener to Kendrick on Arc...`);

        const txHash = await directTransfer(
            'Arc_Testnet',
            TEST_AMOUNT,
            KENDRICK_ADDRESS
        );

        console.log('');
        console.log('  ✓ TRANSFER SUCCESSFUL!');
        console.log(`  TX Hash: ${txHash}`);
        console.log(`  Explorer: https://testnet.arcscan.app/tx/${txHash}`);
    } catch (error) {
        console.log('');
        console.log('  ✗ TRANSFER FAILED!');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

        if (error instanceof Error && error.stack) {
            console.log('');
            console.log('Stack trace:');
            console.log(error.stack);
        }
    }

    console.log('');
    console.log('-'.repeat(60));
    console.log('POST-TRANSFER BALANCE CHECK');
    console.log('-'.repeat(60));

    try {
        const listenerBalance = await getChainBalance('Arc_Testnet', LISTENER_WALLET);
        console.log(`  Listener USDC on Arc: ${formatUSDC(listenerBalance)} USDC`);
    } catch (e) {
        console.log(`  Listener USDC on Arc: ERROR - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    try {
        const kendrickBalance = await getChainBalance('Arc_Testnet', KENDRICK_ADDRESS);
        console.log(`  Kendrick USDC on Arc: ${formatUSDC(kendrickBalance)} USDC`);
    } catch (e) {
        console.log(`  Kendrick USDC on Arc: ERROR - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    console.log('');
    console.log('='.repeat(60));
}

main().catch(console.error);
