import type { Address } from 'viem';
import type { PlayEvent, SessionState, SessionSummary, Song, ListeningActivity } from '../types';
import { DEFAULT_PRICE_PER_SECOND, parseUSDC } from '../config';

// ============================================================================
// Session Manager
// ============================================================================

/**
 * Manages the state of a listening session
 * Tracks play events, calculates costs, and aggregates song totals
 */
export class SessionManager {
    private state: SessionState;
    private currentPlay: PlayEvent | null = null;
    private playInterval: NodeJS.Timeout | null = null;
    /** Track total spent per songId - key data for relayer payouts */
    private songTotals: Map<string, bigint> = new Map();

    constructor() {
        this.state = this.createInitialState();
    }

    // ========================================================================
    // State Initialization
    // ========================================================================

    private createInitialState(): SessionState {
        return {
            id: this.generateSessionId(),
            status: 'inactive',
            channelId: null,
            startedAt: null,
            endedAt: null,
            depositAmount: 0n,
            currentBalance: 0n,
            totalSpent: 0n,
            playHistory: [],
            artistTotals: new Map(), // Keep for backwards compat
        };
    }

    private generateSessionId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    // ========================================================================
    // Session Lifecycle
    // ========================================================================

    /**
     * Start a new session
     */
    startSession(channelId: `0x${string}`, depositAmount: bigint): void {
        this.state = {
            ...this.createInitialState(),
            status: 'active',
            channelId,
            startedAt: Date.now(),
            depositAmount,
            currentBalance: depositAmount,
        };
        this.songTotals = new Map();
    }

    /**
     * End the current session
     */
    endSession(): SessionSummary {
        // Stop any active play
        if (this.currentPlay) {
            this.stopCurrentPlay();
        }

        this.state.status = 'ended';
        this.state.endedAt = Date.now();

        return this.generateSummary();
    }

    /**
     * Reset session to initial state
     */
    reset(): void {
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.currentPlay = null;
        this.songTotals = new Map();
        this.state = this.createInitialState();
    }

    // ========================================================================
    // Play Tracking
    // ========================================================================

    /**
     * Start playing a song
     * Accepts the new Song type from songs.json
     */
    startPlay(song: Song): void {
        // Stop current play if any (this triggers microtransaction recording)
        if (this.currentPlay) {
            this.stopCurrentPlay();
        }

        // Convert pricePerSecond from string to bigint
        const pricePerSecond = song.pricePerSecond
            ? parseUSDC(song.pricePerSecond)
            : DEFAULT_PRICE_PER_SECOND;

        this.currentPlay = {
            songId: song.id,
            artistAddress: '0x0000000000000000000000000000000000000000' as Address, // Not used - tracking by songId
            startTime: Date.now(),
            endTime: null,
            durationSeconds: 0,
            pricePerSecond,
            totalCost: 0n,
        };
    }

    /**
     * Update the current play (call this every second or on demand)
     */
    updateCurrentPlay(): PlayEvent | null {
        if (!this.currentPlay) {
            return null;
        }

        const now = Date.now();
        const durationMs = now - this.currentPlay.startTime;
        const durationSeconds = Math.floor(durationMs / 1000);
        const totalCost = BigInt(durationSeconds) * this.currentPlay.pricePerSecond;

        this.currentPlay.durationSeconds = durationSeconds;
        this.currentPlay.totalCost = totalCost;

        return { ...this.currentPlay };
    }

    /**
     * Stop the current play and record it
     * This is when the "microtransaction" is recorded
     */
    stopCurrentPlay(): PlayEvent | null {
        if (!this.currentPlay) {
            return null;
        }

        // Final update
        this.updateCurrentPlay();

        // Record end time
        this.currentPlay.endTime = Date.now();

        // Add to history
        const completedPlay = { ...this.currentPlay };
        this.state.playHistory.push(completedPlay);

        // Update song totals (aggregate by songId)
        const currentSongTotal = this.songTotals.get(completedPlay.songId) || 0n;
        this.songTotals.set(
            completedPlay.songId,
            currentSongTotal + completedPlay.totalCost
        );

        // Update session totals
        this.state.totalSpent += completedPlay.totalCost;
        this.state.currentBalance = this.state.depositAmount - this.state.totalSpent;

        // Clear current play
        this.currentPlay = null;

        return completedPlay;
    }

    /**
     * Record a completed play event directly
     * Use this for batch recording or when duration is known
     */
    recordPlay(
        songId: string,
        durationSeconds: number,
        pricePerSecond: bigint
    ): PlayEvent {
        const totalCost = BigInt(durationSeconds) * pricePerSecond;
        const now = Date.now();

        const playEvent: PlayEvent = {
            songId,
            artistAddress: '0x0000000000000000000000000000000000000000' as Address,
            startTime: now - durationSeconds * 1000,
            endTime: now,
            durationSeconds,
            pricePerSecond,
            totalCost,
        };

        // Add to history
        this.state.playHistory.push(playEvent);

        // Update song totals
        const currentSongTotal = this.songTotals.get(songId) || 0n;
        this.songTotals.set(songId, currentSongTotal + totalCost);

        // Update session totals
        this.state.totalSpent += totalCost;
        this.state.currentBalance = this.state.depositAmount - this.state.totalSpent;

        return playEvent;
    }

    // ========================================================================
    // State Getters
    // ========================================================================

    /**
     * Get current session state (including live play data)
     */
    getState(): SessionState & { currentPlay: PlayEvent | null } {
        // Update current play if active
        if (this.currentPlay) {
            this.updateCurrentPlay();
        }

        return {
            ...this.state,
            currentPlay: this.currentPlay ? { ...this.currentPlay } : null,
        };
    }

    /**
     * Get session ID
     */
    getSessionId(): string {
        return this.state.id;
    }

    /**
     * Get session status
     */
    getStatus(): SessionState['status'] {
        return this.state.status;
    }

    /**
     * Check if session is active
     */
    isActive(): boolean {
        return this.state.status === 'active';
    }

    /**
     * Get channel ID
     */
    getChannelId(): `0x${string}` | null {
        return this.state.channelId;
    }

    /**
     * Get current balance
     */
    getCurrentBalance(): bigint {
        // Include cost of current play if any
        if (this.currentPlay) {
            this.updateCurrentPlay();
            return this.state.depositAmount - this.state.totalSpent - this.currentPlay.totalCost;
        }
        return this.state.currentBalance;
    }

    /**
     * Get total spent
     */
    getTotalSpent(): bigint {
        // Include cost of current play if any
        if (this.currentPlay) {
            this.updateCurrentPlay();
            return this.state.totalSpent + this.currentPlay.totalCost;
        }
        return this.state.totalSpent;
    }

    /**
     * Get song totals (for settlement) - aggregated by songId
     */
    getSongTotals(): Map<string, bigint> {
        // Create a copy including current play
        const totals = new Map(this.songTotals);

        if (this.currentPlay) {
            this.updateCurrentPlay();
            const currentTotal = totals.get(this.currentPlay.songId) || 0n;
            totals.set(
                this.currentPlay.songId,
                currentTotal + this.currentPlay.totalCost
            );
        }

        return totals;
    }

    /**
     * Get artist totals (legacy - kept for backwards compatibility)
     */
    getArtistTotals(): Map<Address, bigint> {
        return new Map(this.state.artistTotals);
    }

    /**
     * Get play history
     */
    getPlayHistory(): PlayEvent[] {
        return [...this.state.playHistory];
    }

    /**
     * Get current play info
     */
    getCurrentPlay(): PlayEvent | null {
        if (!this.currentPlay) {
            return null;
        }
        this.updateCurrentPlay();
        return { ...this.currentPlay };
    }

    // ========================================================================
    // Listening Activity (for Relayer)
    // ========================================================================

    /**
     * Generate ListeningActivity array for relayer payouts
     * Simple structure: array of { songListened, amountSpent }
     *
     * Example:
     * [
     *   { songListened: "song-123", amountSpent: 500n },
     *   { songListened: "song-456", amountSpent: 300n },
     * ]
     */
    getListeningActivity(): ListeningActivity {
        const songTotals = this.getSongTotals();
        const activity: ListeningActivity = [];

        for (const [songId, amountSpent] of songTotals) {
            if (amountSpent > 0n) {
                activity.push({
                    songListened: songId,
                    amountSpent,
                });
            }
        }

        return activity;
    }

    // ========================================================================
    // Summary Generation
    // ========================================================================

    /**
     * Generate session summary
     */
    generateSummary(): SessionSummary {
        const artistPayments: Array<{ artistAddress: Address; amount: bigint }> = [];

        // For backwards compat, we still generate artistPayments but it may be empty
        const artistTotals = this.getArtistTotals();
        for (const [address, amount] of artistTotals) {
            if (amount > 0n) {
                artistPayments.push({ artistAddress: address, amount });
            }
        }

        const totalSpent = this.getTotalSpent();
        const refundAmount = this.state.depositAmount - totalSpent;

        return {
            sessionId: this.state.id,
            duration: this.state.endedAt && this.state.startedAt
                ? Math.floor((this.state.endedAt - this.state.startedAt) / 1000)
                : 0,
            totalSpent,
            songsPlayed: this.state.playHistory.length + (this.currentPlay ? 1 : 0),
            artistPayments,
            refundAmount: refundAmount > 0n ? refundAmount : 0n,
        };
    }

    // ========================================================================
    // Balance Management
    // ========================================================================

    /**
     * Check if there's enough balance for continued playback
     */
    hasEnoughBalance(minimumSeconds: number = 60): boolean {
        if (!this.currentPlay) {
            return this.state.currentBalance > 0n;
        }

        const requiredAmount = BigInt(minimumSeconds) * this.currentPlay.pricePerSecond;
        return this.getCurrentBalance() >= requiredAmount;
    }

    /**
     * Add funds to the session (after channel resize)
     */
    addFunds(amount: bigint): void {
        this.state.depositAmount += amount;
        this.state.currentBalance = this.state.depositAmount - this.state.totalSpent;
    }

    /**
     * Set the channel ID (for late binding)
     */
    setChannelId(channelId: `0x${string}`): void {
        this.state.channelId = channelId;
    }

    /**
     * Update session status
     */
    setStatus(status: SessionState['status']): void {
        this.state.status = status;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new session manager instance
 */
export function createSessionManager(): SessionManager {
    return new SessionManager();
}
