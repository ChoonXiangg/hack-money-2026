import "dotenv/config";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { getDefaultChain } from "./chains.js";
import wallets from "../wallets.json" with { type: "json" };

// Initialize Bridge Kit
const kit = new BridgeKit();

// Create the Circle Wallets adapter
const adapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Source chain is always Arc (where funds are held)
const SOURCE_CHAIN = getDefaultChain().id;

// Get the listener wallet address (source of funds on Arc)
const SOURCE_WALLET_ADDRESS = wallets.wallets.listener.address;

/**
 * Bridge USDC from Arc to another chain
 * @param {string} destinationAddress - The recipient's wallet address on the destination chain
 * @param {string} destinationChain - The destination chain ID (e.g., "Ethereum_Sepolia")
 * @param {string} amount - Amount of USDC to bridge (e.g., "1.00")
 * @returns {Promise<Object>} Bridge result with transaction details
 */
export async function bridgePayment(destinationAddress, destinationChain, amount) {
  console.log(`Bridging ${amount} USDC from ${SOURCE_CHAIN} to ${destinationChain}`);
  console.log(`  Destination: ${destinationAddress}`);

  try {
    const result = await kit.bridge({
      from: {
        adapter,
        chain: SOURCE_CHAIN,
        address: SOURCE_WALLET_ADDRESS,
      },
      to: {
        adapter,
        chain: destinationChain,
        address: destinationAddress,
      },
      amount,
    });

    console.log(`  Bridge initiated successfully`);
    // Convert BigInt values to strings for JSON serialization
    const safeResult = JSON.parse(JSON.stringify(result, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ));
    return {
      success: true,
      sourceChain: SOURCE_CHAIN,
      destinationChain,
      destinationAddress,
      amount,
      result: safeResult,
    };
  } catch (error) {
    console.error(`  Bridge failed:`, error.message);
    return {
      success: false,
      sourceChain: SOURCE_CHAIN,
      destinationChain,
      destinationAddress,
      amount,
      error: error.message,
    };
  }
}

export { kit, adapter, SOURCE_CHAIN, SOURCE_WALLET_ADDRESS };
