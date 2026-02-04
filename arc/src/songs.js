import wallets from "../wallets.json" with { type: "json" };

/**
 * Song registry with metadata and royalty split configuration
 */
const songs = {
  "song-001": {
    songId: "song-001",
    title: "Midnight Dreams",
    pricePerSecond: "0.0001", // USDC per second
    splits: {
      [wallets.wallets.artist.address]: 50,   // Artist: 50%
      [wallets.wallets.producer.address]: 30, // Producer: 30%
      [wallets.wallets.platform.address]: 20, // Platform: 20%
    },
  },
  "song-002": {
    songId: "song-002",
    title: "Electric Sunrise",
    pricePerSecond: "0.00015", // USDC per second (higher rate)
    splits: {
      [wallets.wallets.artist.address]: 60,   // Artist: 60%
      [wallets.wallets.producer.address]: 25, // Producer: 25%
      [wallets.wallets.platform.address]: 15, // Platform: 15%
    },
  },
  "song-003": {
    songId: "song-003",
    title: "Ocean Waves",
    pricePerSecond: "0.00008", // USDC per second (lower rate)
    splits: {
      [wallets.wallets.artist.address]: 70,   // Artist: 70% (indie artist, higher cut)
      [wallets.wallets.platform.address]: 30, // Platform: 30% (no producer)
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

  // Convert role-based splits to wallet addresses
  const addressSplits = {};
  for (const [role, percentage] of Object.entries(splits)) {
    const wallet = wallets.wallets[role];
    if (wallet) {
      addressSplits[wallet.address] = percentage;
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
