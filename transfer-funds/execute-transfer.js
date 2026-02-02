import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const transferResponse = await client.createTransaction({
  amount: ["0.1"], // Transfer 0.1 USDC
  destinationAddress: "0xd57200be5c64911475821c7ca98b62bd83b098a4",
  tokenAddress: "0x3600000000000000000000000000000000000000", // USDC contract address on Arc Testnet
  blockchain: "ARC-TESTNET",
  walletAddress: "0x32ca66907109e94898443d0414cd9ef696e37915",
  fee: {
    type: "level",
    config: {
      feeLevel: "MEDIUM",
    },
  },
});
console.log(transferResponse.data);