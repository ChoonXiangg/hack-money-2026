import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { bridgePayment } from "./bridgePayment.js";
import { requiresBridging } from "./chains.js";
import { resolveToAddress, isENSName, getPayoutChainPreference } from "./ens.js";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Arc Testnet USDC token ID (native token on Arc)
const USDC_TOKEN_ID = "15dc2b5d-0994-58b0-bf8c-3a0501148ee8";

/**
 * Split a payment to multiple recipients based on percentage splits
 * Supports ENS names as recipient identifiers - they will be resolved automatically.
 * Also reads payout chain preferences from ENS text records.
 * @param {string} fromWalletId - The wallet ID to send from
 * @param {string} totalAmount - Total amount in USDC (e.g., "0.10")
 * @param {Object} splits - Object with recipient addresses/ENS names and split data
 *   e.g., { "artist.eth": { percentage: 50, chain: "Arc_Testnet" }, ... }
 *   Legacy format also supported: { "0xArtist...": 50, ... }
 * @returns {Promise<Array>} Array of transaction/bridge results
 */
export async function splitPayment(fromWalletId, totalAmount, splits) {
  const totalAmountNum = parseFloat(totalAmount);
  const results = [];

  for (const [recipient, splitData] of Object.entries(splits)) {
    // Support both new format { percentage, chain } and legacy format (just number)
    const percentage = typeof splitData === "number" ? splitData : splitData.percentage;
    let chain = typeof splitData === "number" ? null : splitData.chain;

    // Resolve ENS name to address if needed
    let recipientAddress = recipient;
    if (isENSName(recipient)) {
      console.log(`Resolving ENS name: ${recipient}...`);
      const resolved = await resolveToAddress(recipient);
      if (!resolved) {
        console.error(`  Failed to resolve ENS name: ${recipient}`);
        results.push({
          recipient,
          percentage,
          error: `Failed to resolve ENS name: ${recipient}`,
        });
        continue;
      }
      recipientAddress = resolved;
      console.log(`  → Resolved to: ${recipientAddress}`);

      // Check if the ENS name has a payout chain preference
      const ensChainPref = await getPayoutChainPreference(recipient);
      if (ensChainPref) {
        console.log(`  → ENS payout chain preference: ${ensChainPref}`);
        chain = ensChainPref;
      }
    }

    // Calculate the share for this recipient
    const shareAmount = (totalAmountNum * percentage / 100).toFixed(6);

    console.log(`Sending ${shareAmount} USDC (${percentage}%) to ${recipientAddress} on ${chain || "Arc_Testnet"}`);

    // Check if recipient wants payment on a different chain (requires bridging)
    if (chain && requiresBridging(chain)) {
      // Use Bridge Kit to transfer to another chain
      console.log(`  Bridging to ${chain}...`);
      const bridgeResult = await bridgePayment(recipientAddress, chain, shareAmount);

      if (bridgeResult.success) {
        results.push({
          recipientAddress,
          percentage,
          amount: shareAmount,
          chain,
          bridged: true,
          bridgeResult: bridgeResult.result,
        });
        console.log(`  Bridge initiated successfully`);
      } else {
        console.error(`  Bridge failed:`, bridgeResult.error);
        results.push({
          recipientAddress,
          percentage,
          amount: shareAmount,
          chain,
          bridged: true,
          error: bridgeResult.error,
        });
      }
    } else {
      // Direct transfer on Arc (no bridging needed)
      const response = await client.createTransaction({
        walletId: fromWalletId,
        tokenId: USDC_TOKEN_ID,
        destinationAddress: recipientAddress,
        amounts: [shareAmount],
        fee: {
          type: "level",
          config: { feeLevel: "MEDIUM" },
        },
      });

      const txId = response.data?.id;
      if (txId) {
        results.push({ recipientAddress, percentage, amount: shareAmount, chain, txId, bridged: false });
        console.log(`  Transaction ID: ${txId}`);
      } else {
        console.error(`  Failed to create transaction:`, response.data);
        results.push({
          recipientAddress,
          percentage,
          amount: shareAmount,
          chain,
          bridged: false,
          error: "Failed to create transaction",
        });
      }
    }
  }

  return results;
}

export { client, USDC_TOKEN_ID };
