import { splitPayment } from "./splitPayment.js";
import { getSong } from "./songs.js";
import wallets from "../wallets.json" with { type: "json" };

/**
 * Pay for streaming a song for a given duration
 * @param {string} songId - The ID of the song to stream
 * @param {number} seconds - Duration of streaming in seconds
 * @returns {Promise<Object>} Payment confirmation with transaction IDs
 */
export async function payForStream(songId, seconds) {
  // Look up song by ID
  const song = getSong(songId);
  if (!song) {
    throw new Error(`Song not found: ${songId}`);
  }

  // Calculate total cost: pricePerSecond × seconds
  const pricePerSecond = parseFloat(song.pricePerSecond);
  const totalAmount = (pricePerSecond * seconds).toFixed(6);

  console.log(`\n=== Streaming: "${song.title}" ===`);
  console.log(`Duration: ${seconds} seconds`);
  console.log(`Price per second: ${song.pricePerSecond} USDC`);
  console.log(`Total cost: ${totalAmount} USDC`);
  console.log("");

  // Call splitPayment with song's splits
  const listenerWalletId = wallets.wallets.listener.id;
  const txIds = await splitPayment(listenerWalletId, totalAmount, song.splits);

  return {
    songId: song.songId,
    title: song.title,
    seconds,
    totalAmount,
    transactions: txIds,
  };
}
