import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const response = await client.getTransaction({
  id: "ea75f6cc-c8f7-5dc3-a4ef-70e8c2879f4e",
});
console.log(response.data);