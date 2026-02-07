"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";

export default function ConnectWallet() {
  const [address, setAddress] = useState("");
  const [savedAddress, setSavedAddress] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("walletAddress");
    if (stored) {
      setAddress(stored);
      setSavedAddress(stored);
      fetchBalance(stored);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!address) return;
    setSavedAddress(address);
    localStorage.setItem("walletAddress", address);
    window.dispatchEvent(new Event("walletChanged"));
    fetchBalance(address);
  };

  const handleDisconnect = () => {
    setSavedAddress("");
    setAddress("");
    setBalance(null);
    localStorage.removeItem("walletAddress");
    window.dispatchEvent(new Event("walletChanged"));
  };

  const truncated = savedAddress
    ? `${savedAddress.slice(0, 6)}...${savedAddress.slice(-4)}`
    : null;

  return (
    <Dropdown>
      <DropdownTrigger>
        <button
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
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Wallet actions"
        closeOnSelect={false}
        className="bg-black rounded-xl text-white"
        itemClasses={{
          base: "data-[hover=true]:bg-white/10",
        }}
      >
        <DropdownItem key="address-input" isReadOnly textValue="Enter address">
          <div className="w-64">
            <label className="mb-2 block text-xs font-medium text-white">
              Enter Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 font-mono text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
            />
            <button
              onClick={savedAddress ? handleDisconnect : handleSave}
              disabled={!savedAddress && !address}
              className="mt-3 w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:bg-white/40 disabled:text-black/40"
            >
              {savedAddress ? "Disconnect" : "Connect"}
            </button>
          </div>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
