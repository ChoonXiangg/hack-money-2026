import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Arc Testnet USDC token ID (native token on Arc)
const USDC_TOKEN_ID = "15dc2b5d-0994-58b0-bf8c-3a0501148ee8";

/**
 * Split a payment to multiple recipients based on percentage splits
 * @param {string} fromWalletId - The wallet ID to send from
 * @param {string} totalAmount - Total amount in USDC (e.g., "0.10")
 * @param {Object} splits - Object with recipient addresses and percentages
 *   e.g., { "0xArtist...": 50, "0xProducer...": 30, "0xPlatform...": 20 }
 * @returns {Promise<Array>} Array of transaction IDs
 */
export async function splitPayment(fromWalletId, totalAmount, splits) {
  const totalAmountNum = parseFloat(totalAmount);
  const txIds = [];

  for (const [recipientAddress, percentage] of Object.entries(splits)) {
    // Calculate the share for this recipient
    const shareAmount = (totalAmountNum * percentage / 100).toFixed(6);

    console.log(`Sending ${shareAmount} USDC (${percentage}%) to ${recipientAddress}`);

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
      txIds.push({ recipientAddress, percentage, amount: shareAmount, txId });
      console.log(`  Transaction ID: ${txId}`);
    } else {
      console.error(`  Failed to create transaction:`, response.data);
    }
  }

  return txIds;
}

export { client, USDC_TOKEN_ID };
