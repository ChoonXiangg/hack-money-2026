import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import wallets from "../wallets.json" with { type: "json" };

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const walletId = process.argv[2] || wallets.wallets.listener.id;

const response = await client.getWalletTokenBalance({
  id: walletId,
});

console.log(`Wallet ${walletId} balances:`);
console.log(JSON.stringify(response.data, null, 2));
