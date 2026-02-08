"use client";

import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";

// ENS resolution uses Sepolia Testnet for demo purposes
// For production, switch to mainnet
const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

/**
 * Check if a string is a valid ENS name (ends with .eth or other ENS TLDs)
 */
export function isENSName(value: string): boolean {
    if (!value) return false;
    const normalized = value.toLowerCase().trim();
    return (
        normalized.endsWith(".eth") ||
        normalized.endsWith(".xyz") ||
        normalized.endsWith(".box")
    );
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Resolve an ENS name to an Ethereum address
 * Returns null if resolution fails
 */
export async function resolveENSName(name: string): Promise<string | null> {
    try {
        const normalizedName = normalize(name);
        const address = await publicClient.getEnsAddress({
            name: normalizedName,
        });
        return address;
    } catch (error) {
        console.error(`Failed to resolve ENS name "${name}":`, error);
        return null;
    }
}

/**
 * Reverse resolve an Ethereum address to an ENS name
 * Returns null if no primary ENS name is set
 */
export async function resolveAddressToENS(
    address: string
): Promise<string | null> {
    try {
        const name = await publicClient.getEnsName({
            address: address as `0x${string}`,
        });
        return name;
    } catch (error) {
        console.error(`Failed to reverse resolve address "${address}":`, error);
        return null;
    }
}

/**
 * Get the avatar URL for an ENS name
 * Returns null if no avatar is set
 */
export async function getENSAvatar(name: string): Promise<string | null> {
    try {
        const normalizedName = normalize(name);
        const avatar = await publicClient.getEnsAvatar({
            name: normalizedName,
        });
        return avatar;
    } catch (error) {
        console.error(`Failed to get avatar for "${name}":`, error);
        return null;
    }
}

/**
 * Get a text record for an ENS name
 * Can be used for custom records like "lestream.payout-chain"
 */
export async function getENSText(
    name: string,
    key: string
): Promise<string | null> {
    try {
        const normalizedName = normalize(name);
        const text = await publicClient.getEnsText({
            name: normalizedName,
            key,
        });
        return text;
    } catch (error) {
        console.error(`Failed to get text record "${key}" for "${name}":`, error);
        return null;
    }
}

/**
 * Resolve an ENS name or address to a canonical address
 * If input is already an address, returns it.
 * If input is an ENS name, resolves it.
 */
export async function resolveToAddress(
    nameOrAddress: string
): Promise<string | null> {
    if (isValidAddress(nameOrAddress)) {
        return nameOrAddress.toLowerCase();
    }
    if (isENSName(nameOrAddress)) {
        return resolveENSName(nameOrAddress);
    }
    return null;
}

// ============================================
// React Hooks for ENS
// ============================================

import { useState, useEffect } from "react";

/**
 * Hook to resolve an address to an ENS name
 */
export function useENSName(address: string | undefined) {
    const [name, setName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!address || !isValidAddress(address)) {
            setName(null);
            return;
        }

        setIsLoading(true);
        resolveAddressToENS(address)
            .then(setName)
            .finally(() => setIsLoading(false));
    }, [address]);

    return { name, isLoading };
}

/**
 * Hook to resolve an ENS name to an address
 */
export function useENSAddress(name: string | undefined) {
    const [address, setAddress] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!name) {
            setAddress(null);
            setError(null);
            return;
        }

        // If it's already a valid address, just use it
        if (isValidAddress(name)) {
            setAddress(name.toLowerCase());
            setError(null);
            return;
        }

        // If it looks like an ENS name, try to resolve it
        if (isENSName(name)) {
            setIsLoading(true);
            setError(null);
            resolveENSName(name)
                .then((resolved) => {
                    if (resolved) {
                        setAddress(resolved);
                        setError(null);
                    } else {
                        setAddress(null);
                        setError("Could not resolve ENS name");
                    }
                })
                .finally(() => setIsLoading(false));
        } else {
            setAddress(null);
            setError(null);
        }
    }, [name]);

    return { address, isLoading, error };
}

/**
 * Hook to get ENS avatar for a name or address
 */
export function useENSAvatar(nameOrAddress: string | undefined) {
    const [avatar, setAvatar] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!nameOrAddress) {
            setAvatar(null);
            return;
        }

        const fetchAvatar = async () => {
            setIsLoading(true);
            try {
                let ensName = nameOrAddress;

                // If it's an address, first resolve to ENS name
                if (isValidAddress(nameOrAddress)) {
                    const resolved = await resolveAddressToENS(nameOrAddress);
                    if (!resolved) {
                        setAvatar(null);
                        return;
                    }
                    ensName = resolved;
                }

                // Now get the avatar
                const avatarUrl = await getENSAvatar(ensName);
                setAvatar(avatarUrl);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAvatar();
    }, [nameOrAddress]);

    return { avatar, isLoading };
}

/**
 * Hook to get a specific ENS text record
 */
export function useENSText(name: string | undefined, key: string) {
    const [text, setText] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!name || !isENSName(name)) {
            setText(null);
            return;
        }

        setIsLoading(true);
        getENSText(name, key)
            .then(setText)
            .finally(() => setIsLoading(false));
    }, [name, key]);

    return { text, isLoading };
}

/**
 * Hook to get the payout chain preference from ENS text records
 * Reads the "lestream.payout-chain" text record
 */
export function usePayoutChainPreference(ensName: string | undefined) {
    return useENSText(ensName, "lestream.payout-chain");
}
