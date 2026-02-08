import "dotenv/config";
import { ethers } from "ethers";

// Use Sepolia testnet for ENS resolution (demo purposes)
// For production, switch to mainnet: https://eth.llamarpc.com
const provider = new ethers.JsonRpcProvider(
    process.env.ENS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
);

/**
 * Check if a string is a valid ENS name
 */
export function isENSName(value) {
    if (!value || typeof value !== "string") return false;
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
export function isValidAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Resolve an ENS name to an Ethereum address
 * @param {string} name - ENS name (e.g., "vitalik.eth")
 * @returns {Promise<string|null>} - Resolved address or null
 */
export async function resolveENSName(name) {
    try {
        const address = await provider.resolveName(name);
        return address ? address.toLowerCase() : null;
    } catch (error) {
        console.error(`Failed to resolve ENS name "${name}":`, error.message);
        return null;
    }
}

/**
 * Reverse resolve an Ethereum address to an ENS name
 * @param {string} address - Ethereum address
 * @returns {Promise<string|null>} - ENS name or null
 */
export async function resolveAddressToENS(address) {
    try {
        const name = await provider.lookupAddress(address);
        return name;
    } catch (error) {
        console.error(`Failed to reverse resolve "${address}":`, error.message);
        return null;
    }
}

/**
 * Get a text record from an ENS name
 * @param {string} name - ENS name
 * @param {string} key - Text record key (e.g., "lestream.payout-chain")
 * @returns {Promise<string|null>} - Text record value or null
 */
export async function getENSText(name, key) {
    try {
        const resolver = await provider.getResolver(name);
        if (!resolver) return null;
        const text = await resolver.getText(key);
        return text || null;
    } catch (error) {
        console.error(`Failed to get text record "${key}" for "${name}":`, error.message);
        return null;
    }
}

/**
 * Resolve an ENS name or address to a canonical address
 * If input is already an address, returns it lowercase.
 * If input is an ENS name, resolves it.
 * @param {string} nameOrAddress - ENS name or Ethereum address
 * @returns {Promise<string|null>} - Resolved address or null
 */
export async function resolveToAddress(nameOrAddress) {
    if (isValidAddress(nameOrAddress)) {
        return nameOrAddress.toLowerCase();
    }
    if (isENSName(nameOrAddress)) {
        return resolveENSName(nameOrAddress);
    }
    return null;
}

/**
 * Get the payout chain preference from an ENS name's text records
 * @param {string} ensName - ENS name
 * @returns {Promise<string|null>} - Chain ID preference or null
 */
export async function getPayoutChainPreference(ensName) {
    if (!isENSName(ensName)) return null;
    return getENSText(ensName, "lestream.payout-chain");
}
