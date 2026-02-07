import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const walletSetId = "a06e8054-bd94-5e58-ab64-1149b6fd482a";
const walletName = process.argv[2] || "ArbSepoliaWallet";

console.log(`Creating wallet on ARB-SEPOLIA for: ${walletName}`);
console.log(`Wallet Set ID: ${walletSetId}`);

const response = await client.createWallets({
  walletSetId,
  blockchains: ["ARB-SEPOLIA"],
  count: 1,
  metadata: [{ name: walletName }],
});

const wallet = response.data?.wallets?.[0];
if (wallet) {
  console.log(`\n${walletName} wallet created on ARB-SEPOLIA:`);
  console.log(`  ID: ${wallet.id}`);
  console.log(`  Address: ${wallet.address}`);
  console.log(`  Blockchain: ${wallet.blockchain}`);
  console.log(JSON.stringify({
    id: wallet.id,
    address: wallet.address,
    blockchain: "ARB-SEPOLIA",
    role: "Developer wallet on Arbitrum Sepolia"
  }, null, 2));
} else {
  console.log("Failed to create wallet:");
  console.log(JSON.stringify(response.data, null, 2));
}
