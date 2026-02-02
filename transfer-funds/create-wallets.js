import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Create a wallet set
const walletSetResponse = await client.createWalletSet({
  name: "Wallet Set 1",
});

// Create a wallet on Arc Testnet
const walletsResponse = await client.createWallets({
  blockchains: ["ARC-TESTNET"],
  count: 2,
  walletSetId: walletSetResponse.data?.walletSet?.id ?? "",
});