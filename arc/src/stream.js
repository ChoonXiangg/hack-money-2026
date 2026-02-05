import { splitPayment } from "./splitPayment.js";
import { getSong } from "./songs.js";
import wallets from "../wallets.json" with { type: "json" };

/**
 * Pay for streaming a song for a given duration
 * Supports multi-chain payments - recipients can receive on their preferred blockchain
 * @param {string} songId - The ID of the song to stream
 * @param {number} seconds - Duration of streaming in seconds
 * @returns {Promise<Object>} Payment confirmation with transaction/bridge results
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

  // Call splitPayment with song's splits (includes chain preference per recipient)
  const listenerWalletId = wallets.wallets.listener.id;
  const results = await splitPayment(listenerWalletId, totalAmount, song.splits);

  // Summarize results
  const directTransfers = results.filter((r) => !r.bridged);
  const bridgedTransfers = results.filter((r) => r.bridged);

  console.log(`\n=== Payment Summary ===`);
  console.log(`Direct transfers (Arc): ${directTransfers.length}`);
  console.log(`Cross-chain transfers: ${bridgedTransfers.length}`);

  return {
    songId: song.songId,
    title: song.title,
    seconds,
    totalAmount,
    payments: results,
    summary: {
      directTransfers: directTransfers.length,
      bridgedTransfers: bridgedTransfers.length,
    },
  };
}
