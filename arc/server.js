import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { payForStream } from "./src/stream.js";
import { listSongs, getSong, addSong } from "./src/songs.js";
import wallets from "./wallets.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Get all songs
app.get("/api/songs", (req, res) => {
  res.json(listSongs());
});

// Upload a new song
app.post("/api/songs", (req, res) => {
  try {
    const { title, pricePerSecond, splits } = req.body;

    if (!title || !pricePerSecond || !splits) {
      return res.status(400).json({ error: "title, pricePerSecond, and splits are required" });
    }

    // Splits now contain { percentage, chain } per recipient
    const totalSplit = Object.values(splits).reduce(
      (sum, split) => sum + (split.percentage || split), // Support both new and legacy format
      0
    );
    if (totalSplit !== 100) {
      return res.status(400).json({ error: "Splits must total 100%" });
    }

    const song = addSong({ title, pricePerSecond, splits });
    res.status(201).json(song);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get wallet balances
app.get("/api/balances", async (req, res) => {
  try {
    const balances = {};
    for (const [role, wallet] of Object.entries(wallets.wallets)) {
      const response = await client.getWalletTokenBalance({ id: wallet.id });
      const usdcBalance = response.data?.tokenBalances?.find(
        (t) => t.token.symbol === "USDC-TESTNET"
      );
      balances[role] = {
        address: wallet.address,
        balance: usdcBalance?.amount || "0",
      };
    }
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stream a song - pays all recipients on their preferred blockchain
// Response includes: payments array (direct + bridged) and summary
app.post("/api/stream", async (req, res) => {
  try {
    const { songId, seconds } = req.body;
    if (!songId || !seconds) {
      return res.status(400).json({ error: "songId and seconds required" });
    }
    const result = await payForStream(songId, parseInt(seconds));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
