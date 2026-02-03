import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const transactionResponse = await circleDeveloperSdk.getTransaction({
  id: process.env.TRANSACTION_ID!,
});

console.log(JSON.stringify(transactionResponse.data, null, 2));