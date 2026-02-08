"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { BrowserProvider } from "ethers";
import { HoverBorderGradient } from "./ui/hover-border-gradient";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

export default function ConnectWallet() {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const fetchBalance = useCallback(async (walletAddress: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/balance?address=${encodeURIComponent(walletAddress)}`);
      const data = await res.json();
      // Use ytest.usd wallet balance from Sepolia
      if (data.ytestBalance) {
        setBalance(data.ytestBalance);
      } else if (data.total) {
        setBalance(data.total);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check for existing connection on mount and set up 5-second refresh
  useEffect(() => {
    const savedAddress = localStorage.getItem("walletAddress");
    if (savedAddress) {
      setAddress(savedAddress);
      fetchBalance(savedAddress);
    }

    // Refresh balance every 5 seconds
    const intervalId = setInterval(() => {
      const addr = localStorage.getItem("walletAddress");
      if (addr) {
        fetchBalance(addr);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchBalance]);

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accountList = accounts as string[];
      if (accountList.length === 0) {
        // User disconnected
        handleDisconnect();
      } else if (accountList[0] !== address) {
        // User switched accounts
        const newAddress = accountList[0];
        setAddress(newAddress);
        localStorage.setItem("walletAddress", newAddress);
        fetchBalance(newAddress);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [address, fetchBalance]);

  const connectMetaMask = async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install MetaMask to connect your wallet.");
      return;
    }

    setIsConnecting(true);
    try {
      // Use wallet_requestPermissions to force the account picker popup
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      // Now get the selected accounts
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);

      if (accounts && accounts.length > 0) {
        const connectedAddress = accounts[0];
        setAddress(connectedAddress);
        localStorage.setItem("walletAddress", connectedAddress);
        fetchBalance(connectedAddress);
      }
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 4001) {
        // User rejected the connection request
        console.log("User rejected connection");
      } else {
        console.error("Failed to connect MetaMask:", error);
        alert("Failed to connect to MetaMask. Please try again.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAddress("");
    setBalance(null);
    localStorage.removeItem("walletAddress");
    window.dispatchEvent(new Event("walletChanged"));
  };

  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  // If not connected, show connect button
  if (!address) {
    return (
      <div className="min-w-[240px]">
        <HoverBorderGradient
          containerClassName="rounded-full w-full"
          as="button"
          className="bg-black text-white flex items-center justify-center w-full font-[family-name:var(--font-climate)] text-sm px-5 py-3"
          onClick={connectMetaMask}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </span>
          ) : (
            "Connect Wallet"
          )}
        </HoverBorderGradient>
      </div>
    );
  }

  // If connected, show address with dropdown for disconnect
  return (
    <div className="min-w-[240px]">
      <Dropdown>
        <DropdownTrigger>
          <div>
            <HoverBorderGradient
              containerClassName="rounded-full w-full"
              as="button"
              className="bg-black text-white flex items-center w-full font-[family-name:var(--font-climate)] text-sm px-5 py-3"
            >
              <span className="flex items-center gap-2">
                {truncated}
                <span className="font-[family-name:var(--font-murecho)] text-xs font-normal text-white/70">
                  {balance ? `${parseFloat(balance).toFixed(2)} USDC` : ''}
                </span>
              </span>
            </HoverBorderGradient>
          </div>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Wallet actions"
          className="bg-black rounded-xl text-white"
          itemClasses={{
            base: "data-[hover=true]:bg-white/10",
          }}
        >
          <DropdownItem
            key="disconnect"
            onClick={handleDisconnect}
            className="text-red-400"
          >
            Disconnect Wallet
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
}
