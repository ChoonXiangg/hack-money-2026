"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

export default function StreamCredits() {
    const [credits, setCredits] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);

    const fetchYellowBalance = useCallback(async (walletAddress: string) => {
        setIsLoading(true);
        setError(false);
        try {
            // Fetch from session-aware endpoint (checks backend for active session, falls back to custody)
            const res = await fetch(`/api/yellow-session?address=${encodeURIComponent(walletAddress)}`);
            const data = await res.json();

            if (res.ok && data.formatted) {
                // Parse and format to 4 decimal places for display
                const balance = parseFloat(data.formatted);
                setCredits(balance.toFixed(4));
            } else {
                console.error("Failed to fetch Yellow balance:", data.error);
                setError(true);
                setCredits("0.0000");
            }
        } catch (err) {
            console.error("Failed to fetch Yellow session/custody balance:", err);
            setError(true);
            setCredits("0.0000");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Check for wallet address
        const checkAndFetchBalance = () => {
            const walletAddress = localStorage.getItem("walletAddress");
            if (walletAddress) {
                fetchYellowBalance(walletAddress);
            } else {
                setCredits("0.0000");
                setIsLoading(false);
            }
        };

        // Initial fetch
        checkAndFetchBalance();

        // Listen for wallet changes
        const handleWalletChange = () => {
            checkAndFetchBalance();
        };

        window.addEventListener("walletChanged", handleWalletChange);

        // Refresh balance every 10 seconds if wallet is connected
        const interval = setInterval(() => {
            const walletAddress = localStorage.getItem("walletAddress");
            if (walletAddress) {
                fetchYellowBalance(walletAddress);
            }
        }, 10000);

        return () => {
            window.removeEventListener("walletChanged", handleWalletChange);
            clearInterval(interval);
        };
    }, [fetchYellowBalance]);

    return (
        <div
            className="bg-black px-5 py-3 text-sm font-semibold text-white shadow-lg font-[family-name:var(--font-climate)]"
            style={{ borderRadius: "12px" }}
        >
            <span className="flex items-center gap-2">
                Stream Credits
                {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-white/70" />
                ) : credits !== null ? (
                    <span className={`font-[family-name:var(--font-murecho)] text-xs font-normal ${error ? 'text-red-400' : 'text-white/70'}`}>
                        {credits} USDC
                    </span>
                ) : null}
            </span>
        </div>
    );
}
