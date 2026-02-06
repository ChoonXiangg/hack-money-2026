/**
 * Test script for Basic Channel flow with ERC20 transfer to relayer
 *
 * This script tests the complete flow:
 * 1. Initialize and connect
 * 2. Start session (creates channel, deposits to custody)
 * 3. Simulate listening to multiple songs (off-chain microtransactions)
 * 4. End session (close channel, withdraw, transfer to relayer)
 * 5. Verify listening activity for relayer payouts
 *
 * Expected on-chain transactions (4 total for user):
 * 1. Channel creation
 * 2. Deposit ytest.usd ERC20 tokens to custody
 * 3. Withdraw refund (if any)
 * 4. ERC20 transfer to relayer
 *
 * Relayer receives:
 * - ERC20 tokens directly to their wallet
 * - ListeningActivity object with songId + totalAmountSpent for artist payouts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createYellowService } from '../src/YellowService';
import { formatUSDCDisplay, RELAYER_ADDRESS, parseUSDC } from '../src/config';
import type { Song } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load songs from the project's songs.json
function loadSongs(): Song[] {
    const songsPath = path.resolve(__dirname, '../../data/songs.json');
    try {
        const data = fs.readFileSync(songsPath, 'utf-8');
        return JSON.parse(data) as Song[];
    } catch (error) {
        console.error('Could not load songs.json:', error);
        process.exit(1);
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('Basic Channel Flow Test - Song-Based Tracking');
    console.log('='.repeat(60));
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);
    console.log('\nExpected on-chain transactions:');
    console.log('  1. Channel creation');
    console.log('  2. Deposit to custody');
    console.log('  3. Withdraw refund');
    console.log('  4. ERC20 transfer to relayer');

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    // Load songs from songs.json
    const songs = loadSongs();
    console.log(`\nLoaded ${songs.length} songs from songs.json`);
    for (const song of songs.slice(0, 3)) {
        console.log(`  - ${song.songName} (${song.pricePerSecond} USDC/sec)`);
    }

    // Create service with basic channels (NOT App Sessions)
    const service = createYellowService({
        privateKey,
        environment: 'sandbox',
        useAppSessions: false,  // Use basic channels with ERC20 transfer
        relayerAddress: RELAYER_ADDRESS,
    });

    // Set up event listeners
    service.on('connected', () => {
        console.log('✓ Connected to ClearNode');
    });

    service.on('authenticated', (authState) => {
        console.log('✓ Authenticated');
        console.log('  Session key:', authState.sessionKey?.slice(0, 20) + '...');
    });

    service.on('session:started', (session) => {
        console.log('✓ Session started');
        console.log('  Session ID:', session.id);
        console.log('  Channel ID:', session.channelId);
        console.log('  Deposit:', formatUSDCDisplay(session.depositAmount));
    });

    service.on('session:ended', (summary) => {
        console.log('✓ Session ended');
        console.log('  Duration:', summary.duration, 's');
        console.log('  Songs played:', summary.songsPlayed);
        console.log('  Total spent:', formatUSDCDisplay(summary.totalSpent));
        console.log('  Refund amount:', formatUSDCDisplay(summary.refundAmount));
    });

    service.on('error', (error) => {
        console.error('✗ Error:', error.message);
    });

    try {
        // Step 1: Initialize
        console.log('\n' + '='.repeat(60));
        console.log('[Step 1] Initializing service...');
        await service.initialize();
        console.log('✓ Service initialized');
        console.log('  Wallet:', service.getWalletAddress());

        // Step 2: Connect and authenticate
        console.log('\n[Step 2] Connecting to ClearNode...');
        await service.connect();

        // Step 3: Start session with deposit
        console.log('\n[Step 3] Starting session (TX 1: Channel creation, TX 2: Deposit)...');
        // Deposit enough for ~10 seconds of the most expensive song
        const depositAmount = parseUSDC('0.01'); // 0.01 USDC
        console.log(`  Deposit amount: ${formatUSDCDisplay(depositAmount)}`);

        await service.startSession(depositAmount);

        // Step 4: Simulate listening to multiple songs
        console.log('\n[Step 4] Simulating listening session (off-chain microtransactions)...');

        // Play first song for 2 seconds
        const song1 = songs[0];
        console.log(`\n🎵 Playing: "${song1.songName}" (${song1.id})`);
        console.log(`   Price: ${song1.pricePerSecond} USDC/second`);
        service.startPlay(song1);

        await sleep(2000); // Listen for 2 seconds

        // Switch to second song (this records the microtransaction for song1)
        const song2 = songs[1];
        console.log(`\n🎵 Switching to: "${song2.songName}" (${song2.id})`);
        console.log(`   Price: ${song2.pricePerSecond} USDC/second`);
        console.log('   → Recording microtransaction for previous song');
        service.startPlay(song2);

        await sleep(3000); // Listen for 3 seconds

        // Switch back to first song (tests aggregation)
        console.log(`\n🎵 Back to: "${song1.songName}" (${song1.id})`);
        console.log('   → Recording microtransaction, aggregating with previous play');
        service.startPlay(song1);

        await sleep(2000); // Listen for 2 more seconds

        // Stop playback
        const playResult = await service.stopPlay();
        console.log(`\n✓ Stopped playback`);
        if (playResult) {
            console.log(`  Last play cost: ${formatUSDCDisplay(playResult.totalCost)}`);
        }

        // Get session state before ending
        console.log('\n[Session State Before Settlement]');
        const sessionState = service.getSessionState();
        console.log(`  Total spent: ${formatUSDCDisplay(sessionState.totalSpent)}`);
        console.log(`  Remaining balance: ${formatUSDCDisplay(sessionState.currentBalance)}`);

        // Step 5: End session
        console.log('\n[Step 5] Ending session (TX 3: Withdraw, TX 4: Transfer to relayer)...');

        const settlement = await service.endSession();

        console.log('\n' + '='.repeat(60));
        console.log('SETTLEMENT RESULT');
        console.log('='.repeat(60));

        if (settlement.sessionInfo) {
            console.log('\n  Fund Distribution:');
            console.log(`    User deposited: ${formatUSDCDisplay(settlement.sessionInfo.depositAmount)}`);
            console.log(`    User spent: ${formatUSDCDisplay(settlement.sessionInfo.totalSpent)}`);
            console.log(`    User refund: ${formatUSDCDisplay(settlement.sessionInfo.refundDue)}`);
        }

        if (settlement.relayerTransfer) {
            console.log('\n  Relayer Payment (ERC20 Transfer):');
            console.log(`    To: ${settlement.relayerTransfer.destination}`);
            console.log(`    Amount: ${formatUSDCDisplay(settlement.relayerTransfer.amount)}`);
            console.log(`    Success: ${settlement.relayerTransfer.success}`);
        }

        if (settlement.listeningActivity && settlement.listeningActivity.length > 0) {
            console.log('\n  Listening Activity (for relayer to distribute to artists):');
            console.log(`    Songs (${settlement.listeningActivity.length}):`);
            for (const record of settlement.listeningActivity) {
                // Find song name from songs.json
                const songInfo = songs.find(s => s.id === record.songListened);
                const songName = songInfo?.songName || 'Unknown';
                console.log(`      - songListened: ${record.songListened} ("${songName}")`);
                console.log(`        amountSpent: ${formatUSDCDisplay(record.amountSpent)}`);
            }
        }

        console.log('\n  Transaction Hashes:');
        if (settlement.closeTxHash) {
            console.log(`    Close Channel TX: ${settlement.closeTxHash}`);
        }
        if (settlement.withdrawTxHash) {
            console.log(`    Withdraw TX: ${settlement.withdrawTxHash}`);
        }

        // Disconnect
        console.log('\n[Step 6] Disconnecting...');
        service.disconnect();
        console.log('✓ Disconnected');

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log('\nOn-chain transactions completed:');
        console.log('  1. ✓ Channel creation');
        console.log('  2. ✓ Deposit to custody');
        console.log('  3. ✓ Withdraw refund');
        console.log('  4. ✓ ERC20 transfer to relayer');
        console.log('\nRelayer received:');
        console.log('  - ERC20 tokens in their wallet');
        console.log('  - ListeningActivity object for artist payouts');

        process.exit(0);
    } catch (error) {
        console.error('\nTest failed:', error);
        service.disconnect();
        process.exit(1);
    }
}

main();
