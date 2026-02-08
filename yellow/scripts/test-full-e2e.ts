/**
 * End-to-End Test: Music Streaming + Artist Payments
 *
 * FULL FLOW:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ PART 1: Yellow Network (Listener ↔ Relayer on Ethereum)    │
 * │   1. Listener deposits ytest.usd to custody (on-chain)     │
 * │   2. Create channel + resize → unified balance             │
 * │   3. Open App Session, play songs (off-chain micro-txns)   │
 * │   4. Close App Session → funds split in unified balance    │
 * │   5. Close channel → withdraw ytest.usd back to wallets   │
 * ├─────────────────────────────────────────────────────────────┤
 * │ PART 2: Circle Gateway (Relayer on Arc → Artists)          │
 * │   6. Deposit USDC to Circle Gateway on Arc                 │
 * │   7. Pay Artist 1 (Trellion): Arc → Ethereum via Gateway   │
 * │   8. Pay Artist 2 (Kendrick): Arc → Arc (same-chain)       │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Key: No bridging from Ethereum relayer to Arc relayer.
 * The relayer on Arc independently pays artists via Circle Gateway.
 *
 * Run: npx tsx scripts/test-full-e2e.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createYellowService } from '../src/YellowService';
import { formatUSDCDisplay, RELAYER_ADDRESS, parseUSDC } from '../src/config';
import {
    gatewayTransfer,
    depositToGateway,
    formatUSDC,
    getChainBalance,
    getGatewayBalance,
    USDC_ADDRESSES,
} from '../src/gateway';
import type { Song } from '../src/types';
import type { Address, Hex } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

// Listener
const LISTENER_ADDRESS = '0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6' as Address;

// Relayer wallets
const RELAYER_ETHEREUM = '0xC0df42b03E9438dc744935578B4FA90344937FC6' as Address;
const RELAYER_ARC = '0x843b9ec5c49092bbf874acbacb397d2c252e36a4' as Address;

// Artists
const ARTIST_1 = {
    name: 'Trellion',
    address: '0xda29bf5e13cc0a808baa3a435f4e3fbfece8bb6f' as Address,
    blockchain: 'Ethereum_Sepolia',
};

const ARTIST_2 = {
    name: 'Kendrick',
    address: '0x0f19f1f7e413af44b79e30c1cc4a07a25f4eee03' as Address,
    blockchain: 'Arc_Testnet',
};

// Circle Gateway requires minimum ~2 USDC per transfer
const ARTIST_PAYMENT_AMOUNT = '2.5'; // USDC per artist
const GATEWAY_FEE_BUFFER = '1.5'; // USDC for gateway fees

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

// Collect all TX hashes
const allTransactions: Array<{
    step: string;
    chain: string;
    txHash: string;
    description: string;
    explorer?: string;
}> = [];

function recordTx(step: string, chain: string, txHash: string, description: string, explorer?: string) {
    allTransactions.push({ step, chain, txHash, description, explorer });
    console.log(`    TX: ${txHash}`);
    if (explorer) {
        console.log(`    Explorer: ${explorer}`);
    }
}

// ============================================================================
// PART 1: Yellow Network Session
// ============================================================================

async function runYellowSession(): Promise<{
    totalSpent: bigint;
    listeningActivity: Array<{ songListened: string; amountSpent: bigint }>;
}> {
    console.log('');
    console.log('#'.repeat(60));
    console.log('# PART 1: YELLOW NETWORK - MUSIC STREAMING SESSION');
    console.log('#'.repeat(60));
    console.log('');

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        throw new Error('PRIVATE_KEY not found in .env');
    }

    const songs = loadSongs();
    console.log(`Loaded ${songs.length} songs`);

    // Create service
    const service = createYellowService({
        privateKey,
        environment: 'sandbox',
        useAppSessions: true,
        relayerAddress: RELAYER_ADDRESS,
    });

    // Event listeners for TX hashes
    service.on('connected', () => console.log('  Connected to ClearNode'));
    service.on('authenticated', () => console.log('  Authenticated'));

    service.on('transfer:completed', (result) => {
        console.log(`    Microtransaction: ${formatUSDCDisplay(result.amount)} -> relayer`);
    });

    try {
        // Initialize + Connect
        console.log('\n[1.1] Initializing and connecting...');
        await service.initialize();
        console.log(`  Wallet: ${service.getWalletAddress()}`);
        await service.connect();

        // Start session (deposit → channel → resize → app session)
        console.log('\n[1.2] Starting App Session (deposit → channel → resize → app session)...');
        const depositAmount = parseUSDC('0.01'); // 0.01 USDC
        console.log(`  Deposit: ${formatUSDCDisplay(depositAmount)}`);

        await service.startSession(depositAmount);
        console.log('  Session started');

        // Play songs with microtransactions
        console.log('\n[1.3] Playing songs (off-chain microtransactions)...');

        // Song 1: "Dive By Night" for 2 seconds
        const song1 = songs[0]; // Dive By Night
        console.log(`\n  Playing: "${song1.songName}" for 2s`);
        await service.startPlay(song1);
        await sleep(2000);

        // Switch to Song 2: "Muddy Track" for 3 seconds
        const song2 = songs[1]; // Muddy Track
        console.log(`  Switching to: "${song2.songName}" for 3s`);
        await service.startPlay(song2);
        await sleep(3000);

        // Switch back to Song 1 for 2 seconds
        console.log(`  Back to: "${song1.songName}" for 2s`);
        await service.startPlay(song1);
        await sleep(2000);

        // Stop playback
        console.log('  Stopping playback...');
        await service.stopPlay();

        // Get session state
        const sessionState = service.getSessionState();
        console.log(`\n  Total spent: ${formatUSDCDisplay(sessionState.totalSpent)}`);
        console.log(`  Remaining: ${formatUSDCDisplay(sessionState.currentBalance)}`);

        // End session (close app session → close channel → withdraw)
        console.log('\n[1.4] Ending session (settlement)...');
        const settlement = await service.endSession();

        // Record TX hashes from settlement
        if (settlement.withdrawTxHash) {
            recordTx('1.4', 'Ethereum_Sepolia', settlement.withdrawTxHash,
                'User withdrawal (ytest.usd)',
                `https://sepolia.etherscan.io/tx/${settlement.withdrawTxHash}`);
        }

        console.log('\n  Settlement complete:');
        console.log(`    User refund: ${formatUSDCDisplay(settlement.refundAmount)}`);
        if (settlement.relayerTransfer) {
            console.log(`    Relayer payment: ${formatUSDCDisplay(settlement.relayerTransfer.amount)}`);
        }

        if (settlement.listeningActivity && settlement.listeningActivity.length > 0) {
            console.log('\n  Listening Activity:');
            for (const record of settlement.listeningActivity) {
                const songInfo = songs.find(s => s.id === record.songListened);
                console.log(`    - ${songInfo?.songName || record.songListened}: ${formatUSDCDisplay(record.amountSpent)}`);
            }
        }

        // Disconnect
        service.disconnect();
        console.log('\n  Disconnected from Yellow Network');

        return {
            totalSpent: settlement.sessionInfo?.totalSpent || 0n,
            listeningActivity: settlement.listeningActivity || [],
        };

    } catch (error) {
        service.disconnect();
        throw error;
    }
}

// ============================================================================
// PART 2: Circle Gateway - Artist Payments from Arc
// ============================================================================

async function payArtistsFromArc(
    listeningActivity: Array<{ songListened: string; amountSpent: bigint }>
): Promise<void> {
    console.log('');
    console.log('#'.repeat(60));
    console.log('# PART 2: CIRCLE GATEWAY - ARTIST PAYMENTS FROM ARC');
    console.log('#'.repeat(60));
    console.log('');

    console.log('  Relayer (Ethereum): ' + RELAYER_ETHEREUM);
    console.log('  Relayer (Arc): ' + RELAYER_ARC);
    console.log('  Artist 1 (Trellion): ' + ARTIST_1.address + ' on ' + ARTIST_1.blockchain);
    console.log('  Artist 2 (Kendrick): ' + ARTIST_2.address + ' on ' + ARTIST_2.blockchain);
    console.log('');

    // Show listening activity (what the relayer received)
    if (listeningActivity.length > 0) {
        console.log('  Listening Activity from Yellow Network:');
        for (const record of listeningActivity) {
            console.log(`    - Song ${record.songListened}: ${formatUSDCDisplay(record.amountSpent)}`);
        }
        console.log('');
        console.log('  Note: Gateway requires minimum ~2 USDC per transfer.');
        console.log(`  Using ${ARTIST_PAYMENT_AMOUNT} USDC per artist for demo.`);
    }

    // ── Step 2.1: Check relayer's Arc balances ──
    console.log('\n[2.1] Checking relayer balances on Arc...');

    try {
        // Check on-chain USDC balance on Arc
        const arcBalance = await getChainBalance('Arc_Testnet', RELAYER_ETHEREUM);
        console.log(`  Relayer USDC on Arc (on-chain): ${formatUSDC(arcBalance)}`);

        // Check Gateway balance on Arc
        const gwBalance = await getGatewayBalance('Arc_Testnet', RELAYER_ETHEREUM);
        console.log(`  Relayer Gateway balance on Arc: ${formatUSDC(gwBalance.available)} (available)`);
    } catch (e) {
        console.log(`  Could not check Arc balances: ${e}`);
    }

    // Calculate total needed: 2 artists × amount + fee buffer
    const totalNeeded = parseFloat(ARTIST_PAYMENT_AMOUNT) * 2 + parseFloat(GATEWAY_FEE_BUFFER);
    console.log(`\n  Total needed: ${totalNeeded} USDC (${ARTIST_PAYMENT_AMOUNT} × 2 artists + ${GATEWAY_FEE_BUFFER} fees)`);

    // ── Step 2.2: Deposit USDC to Gateway on Arc (if needed) ──
    console.log('\n[2.2] Ensuring Gateway has enough funds on Arc...');

    try {
        const gwBalance = await getGatewayBalance('Arc_Testnet', RELAYER_ETHEREUM);
        const neededWei = BigInt(Math.ceil(totalNeeded * 1_000_000));

        if (gwBalance.available >= neededWei) {
            console.log(`  Already have ${formatUSDC(gwBalance.available)} USDC in Gateway, sufficient`);
        } else {
            console.log(`  Need ${totalNeeded} USDC in Gateway, depositing...`);
            const depositResult = await depositToGateway('Arc_Testnet', totalNeeded.toString());
            console.log('  Deposit to Gateway on Arc:');
            recordTx('2.2a', 'Arc_Testnet', depositResult.approvalTxHash,
                'USDC approval for Gateway on Arc',
                `https://testnet.arcscan.app/tx/${depositResult.approvalTxHash}`);
            recordTx('2.2b', 'Arc_Testnet', depositResult.depositTxHash,
                'Deposit USDC to Gateway on Arc',
                `https://testnet.arcscan.app/tx/${depositResult.depositTxHash}`);
        }
    } catch (error) {
        console.log(`  Gateway deposit check failed: ${error}`);
        console.log('  Attempting deposit anyway...');
        try {
            const depositResult = await depositToGateway('Arc_Testnet', totalNeeded.toString());
            recordTx('2.2a', 'Arc_Testnet', depositResult.approvalTxHash,
                'USDC approval for Gateway on Arc',
                `https://testnet.arcscan.app/tx/${depositResult.approvalTxHash}`);
            recordTx('2.2b', 'Arc_Testnet', depositResult.depositTxHash,
                'Deposit USDC to Gateway on Arc',
                `https://testnet.arcscan.app/tx/${depositResult.depositTxHash}`);
        } catch (depError) {
            console.log(`  Deposit failed: ${depError}`);
            console.log('  Continuing anyway (Gateway may have existing balance)...');
        }
    }

    // ── Step 2.3: Pay Artist 1 (Trellion) — Arc → Ethereum ──
    console.log(`\n[2.3] Paying ${ARTIST_1.name}: Arc → ${ARTIST_1.blockchain}...`);
    console.log(`  Amount: ${ARTIST_PAYMENT_AMOUNT} USDC`);
    console.log(`  Recipient: ${ARTIST_1.address}`);
    console.log(`  Route: Arc_Testnet → ${ARTIST_1.blockchain} (Circle Gateway cross-chain)`);

    try {
        const result = await gatewayTransfer(
            'Arc_Testnet',
            ARTIST_1.blockchain,
            ARTIST_PAYMENT_AMOUNT,
            ARTIST_1.address
        );

        console.log(`  Payment successful!`);
        recordTx('2.3', ARTIST_1.blockchain, result.mintTxHash,
            `Artist payment: ${ARTIST_1.name} (${ARTIST_PAYMENT_AMOUNT} USDC)`,
            `https://sepolia.etherscan.io/tx/${result.mintTxHash}`);
        console.log(`  Burn Intent Sig: ${result.burnIntentSignature.slice(0, 40)}...`);
        console.log(`  Attestation: ${result.attestation.slice(0, 40)}...`);
    } catch (error) {
        console.log(`  Payment failed: ${error instanceof Error ? error.message : error}`);
    }

    // ── Step 2.4: Pay Artist 2 (Kendrick) — Arc → Arc ──
    console.log(`\n[2.4] Paying ${ARTIST_2.name}: Arc → ${ARTIST_2.blockchain}...`);
    console.log(`  Amount: ${ARTIST_PAYMENT_AMOUNT} USDC`);
    console.log(`  Recipient: ${ARTIST_2.address}`);
    console.log(`  Route: Arc_Testnet → ${ARTIST_2.blockchain} (same-chain transfer via Gateway)`);

    try {
        const result = await gatewayTransfer(
            'Arc_Testnet',
            ARTIST_2.blockchain,
            ARTIST_PAYMENT_AMOUNT,
            ARTIST_2.address
        );

        console.log(`  Payment successful!`);
        recordTx('2.4', ARTIST_2.blockchain, result.mintTxHash,
            `Artist payment: ${ARTIST_2.name} (${ARTIST_PAYMENT_AMOUNT} USDC)`,
            `https://testnet.arcscan.app/tx/${result.mintTxHash}`);
        console.log(`  Burn Intent Sig: ${result.burnIntentSignature.slice(0, 40)}...`);
        console.log(`  Attestation: ${result.attestation.slice(0, 40)}...`);
    } catch (error) {
        console.log(`  Payment failed: ${error instanceof Error ? error.message : error}`);
    }

    // ── Step 2.5: Verify final balances ──
    console.log('\n[2.5] Verifying artist balances...');

    try {
        const artist1Balance = await getChainBalance('Ethereum_Sepolia', ARTIST_1.address);
        console.log(`  ${ARTIST_1.name} USDC on Ethereum: ${formatUSDC(artist1Balance)}`);
    } catch (e) {
        console.log(`  Could not check ${ARTIST_1.name} balance: ${e}`);
    }

    try {
        const artist2Balance = await getChainBalance('Arc_Testnet', ARTIST_2.address);
        console.log(`  ${ARTIST_2.name} USDC on Arc: ${formatUSDC(artist2Balance)}`);
    } catch (e) {
        console.log(`  Could not check ${ARTIST_2.name} balance: ${e}`);
    }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('='.repeat(60));
    console.log('END-TO-END TEST: Music Streaming + Artist Payments');
    console.log('='.repeat(60));
    console.log('');
    console.log('Flow:');
    console.log('  Part 1: Yellow Network - Listener streams, relayer earns ytest.usd');
    console.log('  Part 2: Circle Gateway - Relayer on Arc pays artists in USDC');
    console.log('');
    console.log('Participants:');
    console.log(`  Listener: ${LISTENER_ADDRESS}`);
    console.log(`  Relayer (ETH): ${RELAYER_ETHEREUM}`);
    console.log(`  Relayer (Arc): ${RELAYER_ARC}`);
    console.log(`  Artist 1 (${ARTIST_1.name}): ${ARTIST_1.address} on ${ARTIST_1.blockchain}`);
    console.log(`  Artist 2 (${ARTIST_2.name}): ${ARTIST_2.address} on ${ARTIST_2.blockchain}`);

    let listeningActivity: Array<{ songListened: string; amountSpent: bigint }> = [];

    // ── PART 1: Yellow Network Session ──
    try {
        const result = await runYellowSession();
        listeningActivity = result.listeningActivity;
    } catch (error) {
        console.error('\nPart 1 failed:', error);
        console.log('Continuing to Part 2 with empty listening activity...');
    }

    // ── PART 2: Artist Payments from Arc ──
    try {
        await payArtistsFromArc(listeningActivity);
    } catch (error) {
        console.error('\nPart 2 failed:', error);
    }

    // ── SUMMARY ──
    console.log('');
    console.log('#'.repeat(60));
    console.log('# ALL TRANSACTION HASHES');
    console.log('#'.repeat(60));
    console.log('');

    if (allTransactions.length === 0) {
        console.log('  No transactions recorded.');
    } else {
        for (const tx of allTransactions) {
            console.log(`  [${tx.step}] ${tx.description}`);
            console.log(`    Chain: ${tx.chain}`);
            console.log(`    TX: ${tx.txHash}`);
            if (tx.explorer) {
                console.log(`    Explorer: ${tx.explorer}`);
            }
            console.log('');
        }
    }

    console.log('='.repeat(60));
    console.log('END-TO-END TEST COMPLETE');
    console.log('='.repeat(60));

    process.exit(0);
}

main().catch((error) => {
    console.error('\nFatal error:', error);
    process.exit(1);
});
