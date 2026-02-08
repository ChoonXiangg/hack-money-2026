"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

const SUPPORTED_CHAINS = [
    { id: "Arc_Testnet", name: "Arc" },
    { id: "Ethereum_Sepolia", name: "Ethereum Sepolia" },
    { id: "Base_Sepolia", name: "Base Sepolia" },
    { id: "Avalanche_Fuji", name: "Avalanche Fuji" },
];

export default function StreamCredits() {
    const [credits, setCredits] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [depositAmount, setDepositAmount] = useState("");
    const [privateKey, setPrivateKey] = useState("");
    const [isDepositing, setIsDepositing] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [selectedChain, setSelectedChain] = useState("Arc_Testnet");
    const [gatewayBalance, setGatewayBalance] = useState<string | null>(null);
    const [chainBalances, setChainBalances] = useState<{ chain: string; balance: string }[]>([]);

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

    const fetchMultiChainBalance = useCallback(async (walletAddress: string) => {
        try {
            const res = await fetch(`/api/balance?address=${encodeURIComponent(walletAddress)}`);
            const data = await res.json();
            if (res.ok) {
                if (data.gateway?.totalAvailable) {
                    setGatewayBalance(data.gateway.totalAvailable);
                }
                if (data.chainBalances) {
                    setChainBalances(data.chainBalances);
                }
            }
        } catch (err) {
            console.error("Failed to fetch multi-chain balance:", err);
        }
    }, []);

    useEffect(() => {
        // Check for wallet address
        const checkAndFetchBalance = () => {
            const walletAddress = localStorage.getItem("walletAddress");
            if (walletAddress) {
                fetchYellowBalance(walletAddress);
                fetchMultiChainBalance(walletAddress);
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
                fetchMultiChainBalance(walletAddress);
            }
        }, 10000);

        return () => {
            window.removeEventListener("walletChanged", handleWalletChange);
            clearInterval(interval);
        };
    }, [fetchYellowBalance, fetchMultiChainBalance]);

    const handleDeposit = async () => {
        const amount = parseFloat(depositAmount);
        if (isNaN(amount) || amount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount' });
            return;
        }

        if (!privateKey || !privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
            setActionMessage({ type: 'error', text: 'Please enter a valid private key (0x...)' });
            return;
        }

        const walletAddress = localStorage.getItem("walletAddress");
        if (!walletAddress) {
            setActionMessage({ type: 'error', text: 'Please connect your wallet first' });
            return;
        }

        setIsDepositing(true);
        setActionMessage(null);

        try {
            const res = await fetch('/api/yellow/deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userAddress: walletAddress,
                    privateKey: privateKey,
                    depositAmount: depositAmount,
                }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setActionMessage({ type: 'success', text: `Successfully deposited ${depositAmount} USDC and started session!` });
                setDepositAmount("");
                setPrivateKey("");
                // Refresh balance
                fetchYellowBalance(walletAddress);
            } else {
                setActionMessage({ type: 'error', text: data.error || 'Deposit failed' });
            }
        } catch (err) {
            console.error('Deposit error:', err);
            setActionMessage({ type: 'error', text: 'Failed to deposit. Please try again.' });
        } finally {
            setIsDepositing(false);
        }
    };

    const handleWithdraw = async () => {
        const walletAddress = localStorage.getItem("walletAddress");
        if (!walletAddress) {
            setActionMessage({ type: 'error', text: 'Please connect your wallet first' });
            return;
        }

        setIsWithdrawing(true);
        setActionMessage(null);

        try {
            const res = await fetch('/api/yellow/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAddress: walletAddress }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setActionMessage({ type: 'success', text: `Successfully withdrew ${data.amount || 'funds'}!` });
                // Refresh balance
                fetchYellowBalance(walletAddress);
            } else {
                setActionMessage({ type: 'error', text: data.error || 'Withdrawal failed' });
            }
        } catch (err) {
            console.error('Withdraw error:', err);
            setActionMessage({ type: 'error', text: 'Failed to withdraw. Please try again.' });
        } finally {
            setIsWithdrawing(false);
        }
    };

    return (
        <div
            className="bg-black text-sm font-semibold text-white shadow-lg font-[family-name:var(--font-climate)]"
            style={{ borderRadius: "12px" }}
        >
            {/* Header - Always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                style={{ borderRadius: isExpanded ? "12px 12px 0 0" : "12px" }}
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
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-white/70" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-white/70" />
                )}
            </button>

            {/* Dropdown Content */}
            {isExpanded && (
                <div className="px-5 pb-4 border-t border-white/10 mt-2">
                    {/* Multi-Chain Balances */}
                    {chainBalances.length > 0 && (
                        <div className="mt-3 mb-3 p-2 bg-white/5 rounded-lg">
                            <p className="text-xs text-white/60 mb-1.5 font-[family-name:var(--font-murecho)]">
                                USDC Balances (via Gateway)
                            </p>
                            {chainBalances.map((cb) => (
                                <div key={cb.chain} className="flex justify-between text-xs font-[family-name:var(--font-murecho)]">
                                    <span className="text-white/50">{cb.chain}</span>
                                    <span className="text-white/80">{parseFloat(cb.balance).toFixed(4)}</span>
                                </div>
                            ))}
                            {gatewayBalance && (
                                <div className="flex justify-between text-xs font-[family-name:var(--font-murecho)] mt-1 pt-1 border-t border-white/10">
                                    <span className="text-blue-400">Gateway Unified</span>
                                    <span className="text-blue-300">{parseFloat(gatewayBalance).toFixed(4)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Warning Banner */}
                    <div className="mt-3 mb-3 p-2 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                        <p className="text-xs text-yellow-300 font-[family-name:var(--font-murecho)]">
                            ⚠️ <strong>Testnet Only:</strong> Enter your private key to deposit and start a Yellow Network streaming session.
                        </p>
                    </div>

                    {/* Chain Selector */}
                    <div className="mb-3">
                        <label className="block text-xs text-white/60 mb-2 font-[family-name:var(--font-murecho)]">
                            Source Chain
                        </label>
                        <select
                            value={selectedChain}
                            onChange={(e) => setSelectedChain(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm font-[family-name:var(--font-murecho)] focus:outline-none focus:border-white/40 transition-colors appearance-none cursor-pointer"
                        >
                            {SUPPORTED_CHAINS.map((chain) => (
                                <option key={chain.id} value={chain.id} className="bg-black text-white">
                                    {chain.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-3">
                        <label className="block text-xs text-white/60 mb-2 font-[family-name:var(--font-murecho)]">
                            Amount (USDC)
                        </label>
                        <input
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder="0.0100"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm font-[family-name:var(--font-murecho)] focus:outline-none focus:border-white/40 transition-colors"
                        />
                    </div>

                    {/* Private Key Input */}
                    <div className="mb-3">
                        <label className="block text-xs text-white/60 mb-2 font-[family-name:var(--font-murecho)]">
                            Private Key (0x...)
                        </label>
                        <input
                            type="password"
                            placeholder="0x..."
                            value={privateKey}
                            onChange={(e) => setPrivateKey(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-white/40 transition-colors"
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={handleDeposit}
                            disabled={isDepositing || !depositAmount}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                            {isDepositing ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Depositing...
                                </>
                            ) : (
                                'Deposit'
                            )}
                        </button>
                        <button
                            onClick={handleWithdraw}
                            disabled={isWithdrawing}
                            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                            {isWithdrawing ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Withdrawing...
                                </>
                            ) : (
                                'Withdraw'
                            )}
                        </button>
                    </div>

                    {/* Action Message */}
                    {actionMessage && (
                        <div className={`text-xs font-[family-name:var(--font-murecho)] p-2 rounded ${
                            actionMessage.type === 'success'
                                ? 'bg-green-900/30 text-green-300'
                                : 'bg-red-900/30 text-red-300'
                        }`}>
                            {actionMessage.text}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
