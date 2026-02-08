/**
 * Yellow Network Backend Server
 *
 * This server manages Yellow Network app sessions for the music streaming app.
 * It maintains persistent WebSocket connections to Yellow Network and provides
 * REST APIs for the frontend to:
 * - Start/end streaming sessions
 * - Get current session balance (user's allocation)
 * - Track song playback with micropayments
 *
 * Architecture:
 * - Express server with REST API
 * - One YellowService instance per active user session
 * - In-memory session management (can be upgraded to Redis for production)
 * - WebSocket connection to Yellow Network clearnode
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createYellowService } from './YellowService';
import type { YellowService } from './YellowService';
import { formatUSDCDisplay, parseUSDC, RELAYER_ADDRESS } from './config';
import type { Song, ListeningActivity, SongListeningRecord } from './types';
import { gatewayTransfer, depositToGateway, directTransfer, formatUSDC } from './gateway';
import type { Address, Hex } from 'viem';

// ============================================================================
// Song Data for Cross-Chain Payments
// ============================================================================

interface SongData {
    id: string;
    songName: string;
    pricePerSecond: string;
    collaborators: Array<{
        artistName: string;
        address: string;
        blockchain: string;
        percentage?: number;
    }>;
}

function loadSongs(): SongData[] {
    const songsPath = path.join(__dirname, '../../data/songs.json');
    try {
        const data = fs.readFileSync(songsPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load songs.json:', error);
        return [];
    }
}

// Arc Hub Wallet Address (relayer's Arc wallet as the liquidity hub)
const ARC_HUB_WALLET: Address = '0x843b9ec5c49092bbf874acbacb397d2c252e36a4';

/**
 * Pay artists cross-chain using Arc as the Liquidity Hub
 * Flow: Sepolia (Yellow settlement) → Arc (Hub) → Artists (various chains)
 * 
 * Returns transaction hashes for all payments including the hub transfer
 */
async function payArtistsCrossChain(
    listeningActivity: SongListeningRecord[]
): Promise<{
    hubTransfer: { txHash: Hex | null; amount: string; error?: string };
    artistPayments: Array<{
        artistName: string;
        artistAddress: string;
        blockchain: string;
        amount: string;
        txHash: Hex | null;
        error?: string;
    }>;
}> {
    const songs = loadSongs();
    const artistPayments: Array<{
        artistName: string;
        artistAddress: string;
        blockchain: string;
        amount: string;
        txHash: Hex | null;
        error?: string;
    }> = [];

    // Calculate total amount needed for all artists
    let totalPaymentNeeded = 0n;
    const paymentQueue: Array<{
        collaborator: { artistName: string; address: string; blockchain: string };
        share: bigint;
    }> = [];

    for (const record of listeningActivity) {
        const song = songs.find(s => s.id === record.songListened);
        if (!song) continue;

        const collaborators = song.collaborators;
        const totalPercentage = collaborators.reduce((sum, c) => sum + (c.percentage || 0), 0);
        const hasExplicitPercentages = totalPercentage > 0;

        for (const collaborator of collaborators) {
            let share: bigint;
            if (hasExplicitPercentages) {
                share = (record.amountSpent * BigInt(collaborator.percentage || 0)) / 100n;
            } else {
                share = record.amountSpent / BigInt(collaborators.length);
            }

            if (share > 0n) {
                totalPaymentNeeded += share;
                paymentQueue.push({ collaborator, share });
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('ARC LIQUIDITY HUB - CROSS-CHAIN ARTIST PAYMENTS');
    console.log('='.repeat(60));
    console.log(`  Total payment needed: ${formatUSDC(totalPaymentNeeded)} USDC`);
    console.log(`  Arc Hub Wallet: ${ARC_HUB_WALLET}`);

    // Step 1: Deposit to Gateway Wallet on Arc (relayer already has USDC on Arc)
    console.log('\n  STEP 1: Deposit to Gateway on Arc');
    console.log('  ' + '-'.repeat(40));

    let hubTransfer: { txHash: Hex | null; amount: string; error?: string } = {
        txHash: null,
        amount: formatUSDC(totalPaymentNeeded),
    };

    try {
        const depositAmount = formatUSDC(totalPaymentNeeded);
        console.log(`    Depositing ${depositAmount} USDC to Gateway Wallet on Arc...`);

        const depositResult = await depositToGateway('Arc_Testnet', depositAmount);
        hubTransfer.txHash = depositResult.depositTxHash;
        console.log(`    ✓ Gateway deposit TX: ${depositResult.depositTxHash}`);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        hubTransfer.error = errorMsg;
        console.log(`    ✗ Gateway deposit failed: ${errorMsg}`);
        return { hubTransfer, artistPayments };
    }

    // Step 2: Pay artists from Arc Hub
    console.log('\n  STEP 2: Pay Artists from Arc Hub');
    console.log('  ' + '-'.repeat(40));

    for (const { collaborator, share } of paymentQueue) {
        const amountStr = formatUSDC(share);
        console.log(`\n    Artist: ${collaborator.artistName}`);
        console.log(`      Address: ${collaborator.address}`);
        console.log(`      Blockchain: ${collaborator.blockchain}`);
        console.log(`      Amount: ${amountStr} USDC`);

        const destChain = collaborator.blockchain;

        try {
            if (destChain === 'Arc_Testnet') {
                // Native Arc payment - direct ERC20 transfer
                console.log(`      → Native Arc payment (direct USDC transfer)`);

                const txHash = await directTransfer(
                    'Arc_Testnet',
                    amountStr,
                    collaborator.address as Address
                );

                console.log(`      ✓ Transfer TX: ${txHash}`);
                artistPayments.push({
                    artistName: collaborator.artistName,
                    artistAddress: collaborator.address,
                    blockchain: collaborator.blockchain,
                    amount: amountStr,
                    txHash,
                });
            } else {
                // Cross-chain from Arc to other chain
                console.log(`      → Cross-chain: Arc_Testnet → ${destChain}`);

                const result = await gatewayTransfer(
                    'Arc_Testnet',
                    destChain,
                    amountStr,
                    collaborator.address as Address
                );

                console.log(`      ✓ Mint TX: ${result.mintTxHash}`);

                artistPayments.push({
                    artistName: collaborator.artistName,
                    artistAddress: collaborator.address,
                    blockchain: collaborator.blockchain,
                    amount: amountStr,
                    txHash: result.mintTxHash,
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.log(`      ✗ Payment failed: ${errorMsg}`);
            artistPayments.push({
                artistName: collaborator.artistName,
                artistAddress: collaborator.address,
                blockchain: collaborator.blockchain,
                amount: amountStr,
                txHash: null,
                error: errorMsg,
            });
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('ARC HUB PAYMENTS COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Hub Transfer: ${hubTransfer.txHash || 'Failed'}`);
    console.log(`  Artist Payments: ${artistPayments.filter(p => p.txHash).length}/${artistPayments.length} succeeded`);

    return { hubTransfer, artistPayments };
}

const app = express();
const PORT = process.env.YELLOW_SERVER_PORT || 3001;

// Enable CORS for Next.js frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(express.json());

// ============================================================================
// Session Management
// ============================================================================

interface UserSession {
    service: YellowService;
    userAddress: string;
    lastActivity: number;
}

// In-memory session store: walletAddress -> UserSession
const activeSessions = new Map<string, UserSession>();

// Cleanup inactive sessions after 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [address, session] of activeSessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            console.log(`Cleaning up inactive session for ${address}`);
            session.service.disconnect();
            activeSessions.delete(address);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

// ============================================================================
// Helper Functions
// ============================================================================

function getOrCreateSession(userAddress: string, privateKey: `0x${string}`): UserSession {
    let session = activeSessions.get(userAddress);

    if (!session) {
        console.log(`Creating new Yellow service for user ${userAddress}`);
        const service = createYellowService({
            privateKey,
            environment: 'sandbox',
            useAppSessions: true,
            relayerAddress: RELAYER_ADDRESS,
        });

        session = {
            service,
            userAddress,
            lastActivity: Date.now(),
        };

        activeSessions.set(userAddress, session);
    }

    session.lastActivity = Date.now();
    return session;
}

function formatBalance(balance: bigint): string {
    const whole = balance / 1_000_000n;
    const decimal = balance % 1_000_000n;
    return `${whole}.${decimal.toString().padStart(6, '0')}`;
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        activeSessions: activeSessions.size,
        uptime: process.uptime(),
    });
});

/**
 * POST /session/start
 * Start a new streaming session (creates app session with deposit)
 *
 * Body: { userAddress: string, privateKey: string, depositAmount: string }
 */
app.post('/session/start', async (req: Request, res: Response) => {
    try {
        const { userAddress, privateKey, depositAmount } = req.body;

        if (!userAddress || !privateKey || !depositAmount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const session = getOrCreateSession(userAddress, privateKey as `0x${string}`);
        const service = session.service;

        // Initialize and connect if not already
        if (!service.isReady()) {
            await service.initialize();
            await service.connect();
        }

        // Start app session with deposit
        const depositBigInt = parseUSDC(depositAmount);
        const sessionState = await service.startSession(depositBigInt);

        res.json({
            success: true,
            sessionId: sessionState.id,
            channelId: sessionState.channelId,
            depositAmount: formatBalance(sessionState.depositAmount),
            currentBalance: formatBalance(sessionState.currentBalance),
        });
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({
            error: 'Failed to start session',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /session/balance?address=0x...
 * Get current session balance for a user
 *
 * Returns the user's current allocation in their active app session
 */
app.get('/session/balance', (req: Request, res: Response) => {
    try {
        const address = req.query.address as string;

        if (!address) {
            return res.status(400).json({ error: 'Missing address parameter' });
        }

        const session = activeSessions.get(address);

        if (!session) {
            return res.json({
                hasActiveSession: false,
                balance: '0.0000',
                formatted: '0.0000',
                allocations: [],
            });
        }

        const state = session.service.getSessionState();

        // Safely get allocations - check if method exists for backwards compatibility
        let allocations: Array<{ participant: string; asset: string; amount: string }> = [];
        let userAllocationAmount = '0';

        // Cast to any to check for method existence (handles TypeScript not knowing about the method yet)
        const serviceAny = session.service as any;
        if (typeof serviceAny.getAppSessionAllocations === 'function') {
            allocations = serviceAny.getAppSessionAllocations();

            // Find user's allocation amount
            const userAllocation = allocations.find(
                (a: { participant: string; asset: string; amount: string }) => a.participant.toLowerCase() === address.toLowerCase()
            );
            userAllocationAmount = userAllocation?.amount || '0';
        }

        res.json({
            hasActiveSession: state.status === 'active',
            sessionId: state.id,
            balance: state.currentBalance.toString(),
            formatted: formatBalance(state.currentBalance),
            totalSpent: formatBalance(state.totalSpent),
            depositAmount: formatBalance(state.depositAmount),
            allocations, // Array of { participant, asset, amount }
            userAllocationAmount, // User's current allocation in the app session
        });
    } catch (error) {
        console.error('Error getting session balance:', error);
        res.status(500).json({
            error: 'Failed to get session balance',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /session/play
 * Start playing a song (triggers microtransaction if switching songs)
 *
 * Body: { userAddress: string, song: Song }
 */
app.post('/session/play', async (req: Request, res: Response) => {
    try {
        const { userAddress, song } = req.body;

        if (!userAddress || !song) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const session = activeSessions.get(userAddress);

        if (!session) {
            return res.status(400).json({ error: 'No active session' });
        }

        await session.service.startPlay(song as Song);

        const state = session.service.getSessionState();

        res.json({
            success: true,
            currentBalance: formatBalance(state.currentBalance),
            totalSpent: formatBalance(state.totalSpent),
        });
    } catch (error) {
        console.error('Error starting play:', error);
        res.status(500).json({
            error: 'Failed to start play',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /session/stop
 * Stop playing current song
 *
 * Body: { userAddress: string }
 */
app.post('/session/stop', async (req: Request, res: Response) => {
    try {
        const { userAddress } = req.body;

        if (!userAddress) {
            return res.status(400).json({ error: 'Missing userAddress' });
        }

        const session = activeSessions.get(userAddress);

        if (!session) {
            return res.status(400).json({ error: 'No active session' });
        }

        const { playEvent, lastTransactionDetails: txDetails } = await session.service.stopPlay();

        const state = session.service.getSessionState();

        // Build transaction details if we have transaction info from the microtransaction
        let transactionDetails = null;
        if (txDetails && txDetails.cost > 0n) {
            const songs = loadSongs();
            const song = songs.find(s => s.id === txDetails.songId);
            const songName = song?.songName || 'Unknown Song';
            const artistNames = song?.collaborators
                .map(c => c.artistName)
                .filter(Boolean)
                .join(', ') || 'Unknown Artist';

            transactionDetails = {
                amount: formatBalance(txDetails.cost),
                songName,
                artistNames,
                songId: txDetails.songId,
            };
        }

        res.json({
            success: true,
            playEvent,
            currentBalance: formatBalance(state.currentBalance),
            totalSpent: formatBalance(state.totalSpent),
            transactionDetails,
        });
    } catch (error) {
        console.error('Error stopping play:', error);
        res.status(500).json({
            error: 'Failed to stop play',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});


/**
 * POST /session/end
 * End the streaming session (closes app session, withdraws refund)
 *
 * Body: { userAddress: string }
 */
app.post('/session/end', async (req: Request, res: Response) => {
    try {
        const { userAddress } = req.body;

        if (!userAddress) {
            return res.status(400).json({ error: 'Missing userAddress' });
        }

        const session = activeSessions.get(userAddress);

        if (!session) {
            return res.status(400).json({ error: 'No active session' });
        }

        const settlement = await session.service.endSession();

        // Clean up session
        session.service.disconnect();
        activeSessions.delete(userAddress);

        // Convert BigInt values in listeningActivity to strings for JSON serialization
        const serializedListeningActivity = settlement.listeningActivity?.map(item => ({
            songListened: item.songListened,
            amountSpent: typeof item.amountSpent === 'bigint'
                ? formatBalance(item.amountSpent)
                : item.amountSpent,
        })) || [];

        // Pay artists cross-chain using Arc as the Liquidity Hub
        let arcHubPayment: {
            hubTransfer: { txHash: string | null; amount: string; error?: string };
            artistPayments: Array<{
                artistName: string;
                artistAddress: string;
                blockchain: string;
                amount: string;
                txHash: string | null;
                error?: string;
            }>;
        } | null = null;

        if (settlement.listeningActivity && settlement.listeningActivity.length > 0) {
            try {
                arcHubPayment = await payArtistsCrossChain(settlement.listeningActivity);
            } catch (payError) {
                console.error('Error paying artists via Arc Hub:', payError);
                // Don't fail the whole request if artist payments fail
            }
        }

        res.json({
            success: true,
            settlement: {
                totalSpent: formatBalance(settlement.sessionInfo?.totalSpent || 0n),
                refundAmount: formatBalance(settlement.refundAmount),
                listeningActivity: serializedListeningActivity,
                arcHubPayment, // Include Arc Hub payment results
            },
        });
    } catch (error) {
        console.error('Error ending session:', error);
        res.status(500).json({
            error: 'Failed to end session',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('Yellow Network Backend Server');
    console.log('='.repeat(60));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);
    console.log(`Environment: ${process.env.CLEARNODE_WS_URL?.includes('sandbox') ? 'sandbox' : 'production'}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  /health - Health check`);
    console.log(`  POST /session/start - Start streaming session`);
    console.log(`  GET  /session/balance?address=0x... - Get session balance`);
    console.log(`  POST /session/play - Start playing song`);
    console.log(`  POST /session/stop - Stop playing song`);
    console.log(`  POST /session/end - End session`);
    console.log('='.repeat(60));
});

export default app;
