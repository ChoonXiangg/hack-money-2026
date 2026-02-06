"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

export default function ConnectWallet() {
  const [isOpen, setIsOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [savedAddress, setSavedAddress] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchBalance = useCallback(async (walletAddress: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/balance?address=${encodeURIComponent(walletAddress)}`);
      const data = await res.json();
      if (data.total) {
        setBalance(data.total);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSave = () => {
    setSavedAddress(address);
    setIsOpen(false);
    fetchBalance(address);
  };

  const truncated = savedAddress
    ? `${savedAddress.slice(0, 6)}...${savedAddress.slice(-4)}`
    : null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl font-[family-name:var(--font-climate)]"
        style={{ borderRadius: "12px" }}
      >
        {truncated ? (
          <span className="flex items-center gap-2">
            {truncated}
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : balance ? (
              <span className="font-[family-name:var(--font-murecho)] text-xs font-normal text-white/70">
                {parseFloat(balance).toFixed(2)} USDC
              </span>
            ) : null}
          </span>
        ) : (
          "Connect Wallet"
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-3 w-80 rounded-2xl bg-white p-5 shadow-xl z-50">
          <label className="mb-2 block text-xs font-medium text-gray-500">
            Enter Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 font-mono text-sm text-black placeholder:text-gray-400 focus:border-black focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={!address}
            className="mt-3 w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
