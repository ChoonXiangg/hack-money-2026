import { splitPayment } from "./splitPayment.js";
import wallets from "../wallets.json" with { type: "json" };

// Test: Listener pays 0.10 USDC split to Artist (50%), Producer (30%), Platform (20%)
const LISTENER_WALLET_ID = wallets.wallets.listener.id;
const TOTAL_AMOUNT = "0.10";

const splits = {
  [wallets.wallets.artist.address]: 50,   // Artist receives 50% = 0.05 USDC
  [wallets.wallets.producer.address]: 30, // Producer receives 30% = 0.03 USDC
  [wallets.wallets.platform.address]: 20, // Platform receives 20% = 0.02 USDC
};

console.log("=== Test Payment: Listener pays 0.10 USDC ===");
console.log(`From: Listener wallet (${LISTENER_WALLET_ID})`);
console.log(`Total: ${TOTAL_AMOUNT} USDC`);
console.log("");

const results = await splitPayment(LISTENER_WALLET_ID, TOTAL_AMOUNT, splits);

console.log("");
console.log("=== Results ===");
console.log(JSON.stringify(results, null, 2));
