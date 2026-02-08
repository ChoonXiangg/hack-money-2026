/**
 * Test script for App Session-based Music Streaming
 *
 * This demonstrates the full flow with off-chain microtransactions:
 * 1. Connect wallet and authenticate with Yellow Network
 * 2. Start App Session (user deposits, relayer starts at 0)
 * 3. Play songs - switching songs triggers microtransactions (off-chain state updates)
 * 4. Track listening activity by songId
 * 5. Close session with final fund distribution
 *
 * Key differences from basic channels:
 * - Uses App Sessions with single-signer mode (user only)
 * - Off-chain state updates on each song switch (no gas!)
 * - Final close distributes funds: user gets refund, relayer gets spent
 *
 * Expected transactions:
 * 1. Deposit to custody (on-chain)
 * 2. Withdraw refund (on-chain)
 * - All song payments are off-chain microtransactions!
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
    console.log('App Session Music Streaming Test');
    console.log('='.repeat(60));
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);
    console.log('\nFull Yellow Network Workflow:');
    console.log('  1. Deposit to custody (on-chain: wallet → available balance)');
    console.log('  2. Create channel (on-chain: register with clearnode)');
    console.log('  3. Resize/fund channel (on-chain: available → channel-locked → unified balance)');
    console.log('  4. Create App Session (off-chain: unified balance → app session)');
    console.log('  5. Play songs (off-chain microtransactions on switch)');
    console.log('  6. Close App Session (off-chain: app session → unified balance)');
    console.log('  7. Close channel (on-chain: unified → available balance)');
    console.log('  8. Withdraw refund (on-chain: available → wallet)');
    console.log('\nKey benefit: Song payments are OFF-CHAIN (no gas per song!)');

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

    // Create service with App Sessions enabled
    const service = createYellowService({
        privateKey,
        environment: 'sandbox',
        useAppSessions: true,  // Enable App Sessions mode!
        relayerAddress: RELAYER_ADDRESS,
    });

    // Set up event listeners
    service.on('connected', () => {
        console.log('Connected to ClearNode');
    });

    service.on('authenticated', (authState) => {
        console.log('Authenticated');
        console.log('  Session key:', authState.sessionKey?.slice(0, 20) + '...');
    });

    service.on('session:started', (session) => {
        console.log('Session started');
        console.log('  Session ID:', session.id);
        console.log('  Channel ID:', session.channelId);
        console.log('  Deposit:', formatUSDCDisplay(session.depositAmount));
    });

    service.on('session:ended', (summary) => {
        console.log('Session ended');
        console.log('  Duration:', summary.duration, 's');
        console.log('  Songs played:', summary.songsPlayed);
        console.log('  Total spent:', formatUSDCDisplay(summary.totalSpent));
        console.log('  Refund amount:', formatUSDCDisplay(summary.refundAmount));
    });

    service.on('transfer:completed', (result) => {
        console.log(`  Microtransaction: ${formatUSDCDisplay(result.amount)} -> ${result.destination.slice(0, 10)}...`);
    });

    service.on('error', (error) => {
        console.error('Error:', error.message);
    });

    try {
        // Step 1: Initialize
        console.log('\n' + '='.repeat(60));
        console.log('[Step 1] Initializing service...');
        await service.initialize();
        console.log('Service initialized');
        console.log('  Wallet:', service.getWalletAddress());

        // Step 2: Connect and authenticate
        console.log('\n[Step 2] Connecting to ClearNode...');
        await service.connect();

        // Step 3: Start App Session (deposit → channel → resize → app session)
        console.log('\n[Step 3] Starting App Session (full channel dance)...');
        const depositAmount = parseUSDC('0.01'); // 0.01 USDC
        console.log(`  Deposit amount: ${formatUSDCDisplay(depositAmount)}`);
        console.log('  This will: deposit on-chain → create channel → resize → create app session');

        await service.startSession(depositAmount);

        // Step 4: Play songs with microtransactions
        console.log('\n[Step 4] Playing songs (off-chain microtransactions)...');

        // Play first song for 2 seconds
        const song1 = songs[0];
        console.log(`\n  Playing: "${song1.songName}" (${song1.id})`);
        console.log(`   Price: ${song1.pricePerSecond} USDC/second`);
        await service.startPlay(song1);

        await sleep(2000); // Listen for 2 seconds

        // Switch to second song (triggers microtransaction for song1)
        const song2 = songs[1];
        console.log(`\n  Switching to: "${song2.songName}" (${song2.id})`);
        console.log(`   Price: ${song2.pricePerSecond} USDC/second`);
        console.log('   -> Microtransaction for previous song');
        await service.startPlay(song2);

        await sleep(3000); // Listen for 3 seconds

        // Switch back to first song (tests aggregation)
        console.log(`\n  Back to: "${song1.songName}" (${song1.id})`);
        console.log('   -> Microtransaction + aggregating with previous play');
        await service.startPlay(song1);

        await sleep(2000); // Listen for 2 more seconds

        // Stop playback (triggers final microtransaction)
        console.log('\n  Stopping playback...');
        const playResult = await service.stopPlay();
        console.log(`  Stopped playback`);
        if (playResult) {
            console.log(`  Last play cost: ${formatUSDCDisplay(playResult.totalCost)}`);
        }

        // Get session state before ending
        console.log('\n[Session State Before Settlement]');
        const sessionState = service.getSessionState();
        console.log(`  Total spent: ${formatUSDCDisplay(sessionState.totalSpent)}`);
        console.log(`  Remaining balance: ${formatUSDCDisplay(sessionState.currentBalance)}`);

        // Step 5: End session (close app session → close channel → withdraw)
        console.log('\n[Step 5] Ending session (close app session → close channel → withdraw)...');

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
            console.log('\n  Relayer Payment:');
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

        // Disconnect
        console.log('\n[Step 6] Disconnecting...');
        service.disconnect();
        console.log('Disconnected');

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log('\nOn-chain transactions:');
        console.log('  1. Deposit to custody (wallet → available balance)');
        console.log('  2. Create channel (register with clearnode)');
        console.log('  3. Resize/fund channel (available → channel-locked → unified balance)');
        console.log('  4. Close channel (unified → available balance)');
        console.log('  5. Withdraw refund (available → wallet)');
        console.log('\nOff-chain operations (no gas!):');
        console.log('  - Create App Session (unified → app session)');
        console.log('  - State updates on each song switch');
        console.log('  - Close App Session with fund split (app session → unified)');
        console.log('  - Transfer relayer payment (user unified → relayer unified)');
        console.log('\nRelayer received:');
        console.log('  - Funds in their unified balance (ready to withdraw)');
        console.log('  - ListeningActivity object for artist payouts');

        process.exit(0);
    } catch (error) {
        console.error('\nTest failed:', error);
        service.disconnect();
        process.exit(1);
    }
}

main();
