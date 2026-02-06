import wallets from "../wallets.json" with { type: "json" };
import { getDefaultChain } from "./chains.js";

const DEFAULT_CHAIN = getDefaultChain().id;

/**
 * Song registry with metadata and royalty split configuration
 * Splits now include chain preference per recipient: { percentage, chain }
 */
const songs = {
  "song-001": {
    songId: "song-001",
    title: "Midnight Dreams",
    pricePerSecond: "0.0001", // USDC per second
    splits: {
      [wallets.wallets.artist.address]: { percentage: 50, chain: DEFAULT_CHAIN },
      [wallets.wallets.producer.address]: { percentage: 30, chain: DEFAULT_CHAIN },
      [wallets.wallets.platform.address]: { percentage: 20, chain: DEFAULT_CHAIN },
    },
  },
  "song-002": {
    songId: "song-002",
    title: "Electric Sunrise",
    pricePerSecond: "0.00015", // USDC per second (higher rate)
    splits: {
      [wallets.wallets.artist.address]: { percentage: 60, chain: DEFAULT_CHAIN },
      [wallets.wallets.producer.address]: { percentage: 25, chain: DEFAULT_CHAIN },
      [wallets.wallets.platform.address]: { percentage: 15, chain: DEFAULT_CHAIN },
    },
  },
  "song-003": {
    songId: "song-003",
    title: "Ocean Waves",
    pricePerSecond: "0.00008", // USDC per second (lower rate)
    splits: {
      [wallets.wallets.artist.address]: { percentage: 70, chain: DEFAULT_CHAIN },
      [wallets.wallets.platform.address]: { percentage: 30, chain: DEFAULT_CHAIN },
    },
  },
};

export function getSong(songId) {
  return songs[songId];
}

export function listSongs() {
  return Object.values(songs);
}

export function addSong({ title, pricePerSecond, splits }) {
  const songId = `song-${String(Object.keys(songs).length + 1).padStart(3, "0")}`;

  // Convert splits to wallet addresses
  // Accepts either role names (e.g., "producer") or raw wallet addresses (e.g., "0x...")
  // Split values can be: number (legacy) or { percentage, chain } (new format)
  const addressSplits = {};
  for (const [key, value] of Object.entries(splits)) {
    // Normalize value to { percentage, chain } format
    const splitData =
      typeof value === "number"
        ? { percentage: value, chain: DEFAULT_CHAIN }
        : { percentage: value.percentage, chain: value.chain || DEFAULT_CHAIN };

    // Check if key is already a wallet address (starts with 0x and is 42 chars)
    if (key.startsWith("0x") && key.length === 42) {
      addressSplits[key.toLowerCase()] = splitData;
    } else {
      // Otherwise, treat it as a role name and look up the wallet
      const wallet = wallets.wallets[key];
      if (wallet) {
        addressSplits[wallet.address] = splitData;
      }
    }
  }

  const song = {
    songId,
    title,
    pricePerSecond: String(pricePerSecond),
    splits: addressSplits,
  };

  songs[songId] = song;
  return song;
}
