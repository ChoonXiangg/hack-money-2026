// Import Bridge Kit and the Circle Wallets adapter
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

// Initialize the SDK
const kit = new BridgeKit();

const bridgeUSDC = async () => {
  try {
    // Set up the Circle Wallets adapter instance, works for both ecosystems
    const adapter = createCircleWalletsAdapter({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });

    console.log("---------------Starting Bridging---------------");

    // Use the same adapter for the source and destination blockchains
    const result = await kit.bridge({
      from: {
        adapter,
        chain: "Ethereum_Sepolia",
        address: process.env.EVM_WALLET_ADDRESS!, // EVM address (developer-controlled)
      },
      to: {
        adapter,
        chain: "Arc_Testnet",
        address: process.env.EVM_WALLET_ADDRESS!, // EVM address (developer-controlled)
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();