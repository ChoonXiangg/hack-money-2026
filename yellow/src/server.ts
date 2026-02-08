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
import { createYellowService } from './YellowService';
import type { YellowService } from './YellowService';
import { formatUSDCDisplay, parseUSDC, RELAYER_ADDRESS } from './config';
import type { Song } from './types';

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

        const playEvent = await session.service.stopPlay();

        const state = session.service.getSessionState();

        res.json({
            success: true,
            playEvent,
            currentBalance: formatBalance(state.currentBalance),
            totalSpent: formatBalance(state.totalSpent),
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

        res.json({
            success: true,
            settlement: {
                totalSpent: formatBalance(settlement.sessionInfo?.totalSpent || 0n),
                refundAmount: formatBalance(settlement.refundAmount),
                listeningActivity: serializedListeningActivity,
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
