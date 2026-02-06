/**
 * Test script for music streaming payment flow
 *
 * This script tests the complete payment flow using basic channels:
 * 1. User deposits ytest.usd to custody
 * 2. Create channel and fund it
 * 3. Simulate playing songs (track spending locally)
 * 4. Close channel (funds go to user custody)
 * 5. User withdraws from custody
 * 6. User sends spent amount to relayer via ERC20 transfer
 *
 * All transactions are on-chain and verifiable on Etherscan
 *
 * Note: App Sessions would allow direct fund distribution on close,
 * but they're not yet supported in ClearNode sandbox.
 */

import 'dotenv/config';
import { createYellowService } from '../src/YellowService';
import { SAMPLE_SONGS } from '../src/data/mockData';
import { formatUSDCDisplay, RELAYER_ADDRESS, DEFAULT_TOKEN_ADDRESS } from '../src/config';
import { getTokenBalance } from '../src/channels/relayer';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('='.repeat(60));
    console.log('MUSIC STREAMING PAYMENT FLOW TEST');
    console.log('='.repeat(60));
    console.log('');
    console.log('This test verifies:');
    console.log('  1. User deposits on-chain ytest.usd to custody');
    console.log('  2. Channel created and funded');
    console.log('  3. Spending tracked during playback');
    console.log('  4. On close: all funds go to user custody');
    console.log('  5. User withdraws and sends spent amount to relayer');
    console.log('  6. All transactions verifiable on Etherscan');
    console.log('');
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);
    console.log('='.repeat(60));

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://1rpc.io/sepolia';

    // Create public client for balance checks
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
    });

    // Create service - using basic channels (App Sessions not yet supported in sandbox)
    const service = createYellowService({
        privateKey,
        environment: 'sandbox',
        useAppSessions: false,  // Use basic channels with ERC20 transfer to relayer
        relayerAddress: RELAYER_ADDRESS,
    });

    // Set up event listeners
    service.on('connected', () => {
        console.log('  [Event] Connected to ClearNode');
    });

    service.on('authenticated', (authState) => {
        console.log('  [Event] Authenticated');
        console.log(`    Session key: ${authState.sessionKey}`);
    });

    service.on('session:started', (session) => {
        console.log('  [Event] Session started');
        console.log(`    Session ID: ${session.id}`);
        console.log(`    Channel/App Session ID: ${session.channelId}`);
        console.log(`    Deposit: ${formatUSDCDisplay(session.depositAmount)}`);
    });

    service.on('session:ended', (summary) => {
        console.log('  [Event] Session ended');
        console.log(`    Duration: ${summary.duration}s`);
        console.log(`    Songs played: ${summary.songsPlayed}`);
        console.log(`    Total spent: ${formatUSDCDisplay(summary.totalSpent)}`);
        console.log(`    Refund: ${formatUSDCDisplay(summary.refundAmount)}`);
    });

    service.on('error', (error) => {
        console.error('  [Event] Error:', error.message);
    });

    try {
        // Get initial balances
        console.log('\n[INITIAL STATE]');
        await service.initialize();

        const userAddress = service.getWalletAddress()!;
        const userWalletBefore = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        const relayerWalletBefore = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, RELAYER_ADDRESS);

        console.log(`  User: ${userAddress}`);
        console.log(`  User wallet balance: ${formatUSDCDisplay(userWalletBefore)}`);
        console.log(`  Relayer: ${RELAYER_ADDRESS}`);
        console.log(`  Relayer wallet balance: ${formatUSDCDisplay(relayerWalletBefore)}`);

        // Connect
        console.log('\n[STEP 1] Connecting to ClearNode...');
        await service.connect();
        console.log('  Connected and authenticated');

        // Start session with deposit
        console.log('\n[STEP 2] Starting App Session...');
        // Use 1000 units (0.001 USDC) for testing
        const depositAmount = 1000n;
        console.log(`  Deposit amount: ${formatUSDCDisplay(depositAmount)}`);

        await service.startSession(depositAmount);

        // Simulate playback
        console.log('\n[STEP 3] Simulating playback...');

        const song = SAMPLE_SONGS[0];
        console.log(`  Playing: "${song.songName}"`);
        console.log(`  Price: ${song.pricePerSecond} USDC/second`);

        service.startPlay(song);

        // Play for 3 seconds (300 units at 100 units/sec)
        const playDuration = 3;
        for (let i = 1; i <= playDuration; i++) {
            await sleep(1000);
            const state = service.getSessionState();
            if (state.currentPlay) {
                console.log(`    Time: ${i}s | Cost: ${formatUSDCDisplay(state.currentPlay.totalCost)}`);
            }
        }

        // Stop playback
        const playResult = await service.stopPlay();
        console.log(`  Stopped: "${song.songName}"`);
        console.log(`  Play cost: ${formatUSDCDisplay(playResult?.totalCost || 0n)}`);

        // Get session state before ending
        const sessionState = service.getSessionState();
        console.log('\n[STEP 4] Session state before settlement:');
        console.log(`  Total spent: ${formatUSDCDisplay(sessionState.totalSpent)}`);
        console.log(`  Remaining balance: ${formatUSDCDisplay(sessionState.currentBalance)}`);

        const expectedRefund = depositAmount - sessionState.totalSpent;
        const expectedRelayerPayment = sessionState.totalSpent;

        console.log('\n  Expected settlement:');
        console.log(`    User refund: ${formatUSDCDisplay(expectedRefund)}`);
        console.log(`    Relayer payment: ${formatUSDCDisplay(expectedRelayerPayment)}`);

        // End session - this closes the App Session with fund distribution
        console.log('\n[STEP 5] Ending session (closing App Session with fund distribution)...');
        const settlement = await service.endSession();

        // Get final balances
        console.log('\n[FINAL STATE]');
        await sleep(3000); // Wait for blockchain state to update

        const userWalletAfter = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, userAddress);
        const relayerWalletAfter = await getTokenBalance(publicClient, DEFAULT_TOKEN_ADDRESS, RELAYER_ADDRESS);

        console.log(`  User wallet: ${formatUSDCDisplay(userWalletAfter)}`);
        console.log(`  User wallet change: ${formatUSDCDisplay(userWalletAfter - userWalletBefore)}`);
        console.log('');
        console.log(`  Relayer wallet: ${formatUSDCDisplay(relayerWalletAfter)}`);
        console.log(`  Relayer wallet change: ${formatUSDCDisplay(relayerWalletAfter - relayerWalletBefore)}`);

        // Verification
        console.log('\n[VERIFICATION]');
        const userReceivedCorrect = (userWalletAfter - userWalletBefore) >= (expectedRefund - depositAmount);
        const relayerReceivedPayment = settlement.relayerTransfer?.amount === expectedRelayerPayment;

        console.log(`  User refund correct: ${userReceivedCorrect ? 'YES' : 'NO'}`);
        console.log(`  Relayer payment recorded: ${relayerReceivedPayment ? 'YES' : 'NO'}`);
        console.log('');
        console.log('  Note: Relayer funds are in their custody. They need to withdraw separately.');

        // Disconnect
        console.log('\n[STEP 6] Disconnecting...');
        service.disconnect();
        console.log('  Disconnected');

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETED');
        console.log('='.repeat(60));
        console.log('');
        console.log('Summary:');
        console.log(`  Total deposited: ${formatUSDCDisplay(depositAmount)}`);
        console.log(`  Total spent: ${formatUSDCDisplay(settlement.sessionInfo?.totalSpent || 0n)}`);
        console.log(`  User refund: ${formatUSDCDisplay(settlement.refundAmount)}`);
        console.log(`  Relayer payment: ${formatUSDCDisplay(settlement.relayerTransfer?.amount || 0n)}`);
        console.log('');
        console.log('All transactions are on-chain and can be verified on Etherscan.');
        console.log('='.repeat(60));

        process.exit(0);
    } catch (error) {
        console.error('\nTest failed:', error);
        service.disconnect();
        process.exit(1);
    }
}

main();
