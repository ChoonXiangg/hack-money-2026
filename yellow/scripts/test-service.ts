/**
 * Test script for YellowService
 *
 * This script tests the complete flow:
 * 1. Initialize and connect
 * 2. Start a session with deposit
 * 3. Simulate playing a song
 * 4. End session and transfer spent amount to relayer
 */

import 'dotenv/config';
import { createYellowService } from '../src/YellowService';
import { SAMPLE_SONGS } from '../src/data/mockData';
import { formatUSDCDisplay, RELAYER_ADDRESS } from '../src/config';

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('='.repeat(60));
    console.log('YellowService Integration Test - Relayer Flow');
    console.log('='.repeat(60));
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    // Create service
    const service = createYellowService({
        privateKey,
        environment: 'sandbox',
    });

    // Set up event listeners
    service.on('connected', () => {
        console.log('✓ Connected to ClearNode');
    });

    service.on('authenticated', (authState) => {
        console.log('✓ Authenticated');
        console.log('  Session key:', authState.sessionKey);
    });

    service.on('session:started', (session) => {
        console.log('✓ Session started');
        console.log('  Session ID:', session.id);
        console.log('  Channel ID:', session.channelId);
        console.log('  Deposit:', formatUSDCDisplay(session.depositAmount));
    });

    service.on('session:updated', (session) => {
        // Only log significant updates (not every second)
    });

    service.on('session:ended', (summary) => {
        console.log('✓ Session ended');
        console.log('  Duration:', summary.duration, 's');
        console.log('  Songs played:', summary.songsPlayed);
        console.log('  Total spent:', formatUSDCDisplay(summary.totalSpent));
        console.log('  Refund amount:', formatUSDCDisplay(summary.refundAmount));
        if (summary.artistPayments.length > 0) {
            console.log('  Artist earnings:');
            for (const payment of summary.artistPayments) {
                console.log(`    - ${payment.artistAddress}: ${formatUSDCDisplay(payment.amount)}`);
            }
        }
    });

    service.on('channel:created', (channelId) => {
        console.log('✓ Channel created:', channelId);
    });

    service.on('channel:funded', (_channelId, amount) => {
        console.log('✓ Channel funded:', formatUSDCDisplay(amount));
    });

    service.on('error', (error) => {
        console.error('✗ Error:', error.message);
    });

    try {
        // Step 1: Initialize
        console.log('\n[Step 1] Initializing service...');
        await service.initialize();
        console.log('✓ Service initialized');

        // Step 2: Connect and authenticate
        console.log('\n[Step 2] Connecting to ClearNode...');
        await service.connect();

        // Step 3: Start session
        console.log('\n[Step 3] Starting listening session...');
        // Use a small deposit amount that user can afford
        // 50 units = 0.00005 USDC (with 6 decimals)
        // This allows 0.5 seconds of playback at 100 units/sec
        const depositAmount = 50n;
        await service.startSession(depositAmount);

        // Step 4: Simulate playing a song
        console.log('\n[Step 4] Simulating playback...');

        const song = SAMPLE_SONGS[0];
        console.log(`\n🎵 Playing: "${song.songName}"`);
        console.log(`   Price: ${song.pricePerSecond} USDC/second`);
        service.startPlay(song);

        // Simulate 1 second of playback (deposit is 200 units, price is 100/sec)
        const playDuration = 1;
        for (let i = 1; i <= playDuration; i++) {
            await sleep(1000);
            const state = service.getSessionState();
            if (state.currentPlay) {
                process.stdout.write(`\r   ⏱️ Time: ${i}s | 💰 Cost: ${formatUSDCDisplay(state.currentPlay.totalCost)}   `);
            }
        }
        console.log(); // New line after ticker

        // Stop playback
        const playResult = await service.stopPlay();
        console.log(`\n✓ Stopped: "${song.songName}"`);
        console.log(`  Total play cost: ${formatUSDCDisplay(playResult?.totalCost || 0n)}`);

        // Get session state before ending
        console.log('\n[Session Summary Before Settlement]');
        const sessionState = service.getSessionState();
        console.log(`  Total spent: ${formatUSDCDisplay(sessionState.totalSpent)}`);
        console.log(`  Remaining balance: ${formatUSDCDisplay(sessionState.currentBalance)}`);

        // Step 5: End session - close, withdraw, transfer to relayer
        console.log('\n[Step 5] Ending session...');
        console.log('  - Closing channel (funds go to user custody)');
        console.log('  - Withdrawing from custody');
        console.log('  - Sending spent amount to relayer');

        const settlement = await service.endSession();

        console.log('\n' + '='.repeat(60));
        console.log('SETTLEMENT COMPLETE');
        console.log('='.repeat(60));
        console.log(`  Channel Close TX: ${settlement.closeTxHash}`);
        if (settlement.withdrawTxHash) {
            console.log(`  Withdraw TX: ${settlement.withdrawTxHash}`);
        }

        if (settlement.sessionInfo) {
            console.log('\n  Session Summary:');
            console.log(`    User: ${settlement.sessionInfo.userAddress}`);
            console.log(`    Total Deposited: ${formatUSDCDisplay(settlement.sessionInfo.depositAmount)}`);
            console.log(`    Total Spent: ${formatUSDCDisplay(settlement.sessionInfo.totalSpent)}`);
            console.log(`    User Keeps (refund): ${formatUSDCDisplay(settlement.sessionInfo.refundDue)}`);
        }

        if (settlement.relayerTransfer) {
            console.log('\n  Relayer Payment:');
            console.log(`    To: ${settlement.relayerTransfer.destination}`);
            console.log(`    Amount: ${formatUSDCDisplay(settlement.relayerTransfer.amount)}`);
            console.log(`    Success: ${settlement.relayerTransfer.success}`);
        }

        if (settlement.transfers.length > 0) {
            console.log('\n  Artist Distribution (via relayer):');
            for (const transfer of settlement.transfers) {
                console.log(`    - ${transfer.destination.slice(0, 10)}...: ${formatUSDCDisplay(transfer.amount)}`);
            }
        }

        // Disconnect
        console.log('\n[Step 6] Disconnecting...');
        service.disconnect();
        console.log('✓ Disconnected');

        console.log('\n' + '='.repeat(60));
        console.log('Test completed successfully!');
        console.log('='.repeat(60));

        process.exit(0);
    } catch (error) {
        console.error('\nTest failed:', error);
        service.disconnect();
        process.exit(1);
    }
}

main();
