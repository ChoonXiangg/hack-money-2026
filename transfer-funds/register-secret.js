import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

const response = await registerEntitySecretCiphertext({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  recoveryFileDownloadPath: "./", // SAVE THIS FILE!
});