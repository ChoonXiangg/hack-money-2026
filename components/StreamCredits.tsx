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

            if (res.ok) {
                // Prefer userAllocationAmount (app session allocation) if available
                if (data.userAllocationAmount && data.userAllocationAmount !== '0') {
                    // Format the allocation amount (it's in wei, needs to be divided by 1e6)
                    const amountBigInt = BigInt(data.userAllocationAmount);
                    const million = BigInt(1000000);
                    const whole = amountBigInt / million;
                    const decimal = amountBigInt % million;
                    const formatted = `${whole}.${decimal.toString().padStart(6, '0')}`;
                    setCredits(parseFloat(formatted).toFixed(4));
                } else if (data.formatted) {
                    // Fall back to session/custody balance
                    const balance = parseFloat(data.formatted);
                    setCredits(balance.toFixed(4));
                } else {
                    setCredits("0.0000");
                }
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

        // Refresh balance every 5 seconds if wallet is connected
        const interval = setInterval(() => {
            const walletAddress = localStorage.getItem("walletAddress");
            if (walletAddress) {
                fetchYellowBalance(walletAddress);
                fetchMultiChainBalance(walletAddress);
            }
        }, 5000);

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
            className="bg-black text-sm font-semibold text-white shadow-lg font-[family-name:var(--font-climate)] min-w-[240px]"
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
                    <span className={`font-[family-name:var(--font-murecho)] text-xs font-normal ${error ? 'text-red-400' : 'text-white/70'}`}>
                        {credits !== null ? `${credits} USDC` : ''}
                    </span>
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
                        <div className={`text-xs font-[family-name:var(--font-murecho)] p-2 rounded ${actionMessage.type === 'success'
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
