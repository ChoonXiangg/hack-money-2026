import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const walletSetId = "a06e8054-bd94-5e58-ab64-1149b6fd482a";
const walletName = process.argv[2] || "Listener";

const response = await client.createWallets({
  walletSetId,
  blockchains: ["ARC-TESTNET"],
  count: 1,
  metadata: [{ name: walletName }],
});

const wallet = response.data?.wallets?.[0];
if (wallet) {
  console.log(`${walletName} wallet created:`);
  console.log(`  ID: ${wallet.id}`);
  console.log(`  Address: ${wallet.address}`);
} else {
  console.log(JSON.stringify(response.data, null, 2));
}
