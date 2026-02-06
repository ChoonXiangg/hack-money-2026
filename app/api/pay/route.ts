import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

const SONGS_DATA_PATH = path.join(process.cwd(), "data", "songs.json");

// Arc Testnet USDC token ID
const USDC_TOKEN_ID = "15dc2b5d-0994-58b0-bf8c-3a0501148ee8";

// Source chain and wallet address for bridging
const SOURCE_CHAIN = "Arc_Testnet";
const SOURCE_WALLET_ADDRESS = "0x843b9ec5c49092bbf874acbacb397d2c252e36a4";

interface Collaborator {
  artistName: string;
  address: string;
  blockchain: string;
}

interface SongData {
  id: string;
  songName: string;
  pricePerSecond: string;
  collaborators: Collaborator[];
  songFile: string;
  imageFile: string;
  createdAt: string;
}

function getCircleCredentials() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecret) {
    throw new Error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET");
  }

  return { apiKey, entitySecret };
}

function getCircleClient() {
  const { apiKey, entitySecret } = getCircleCredentials();
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

function requiresBridging(chain: string): boolean {
  return chain !== SOURCE_CHAIN;
}

async function loadSong(songId: string): Promise<SongData | null> {
  if (!existsSync(SONGS_DATA_PATH)) return null;
  const data = await readFile(SONGS_DATA_PATH, "utf-8");
  const songs: SongData[] = JSON.parse(data);
  return songs.find((s) => s.id === songId) || null;
}

export async function POST(request: NextRequest) {
  try {
    const { songId, seconds } = await request.json();

    if (!songId || !seconds || seconds <= 0) {
      return NextResponse.json(
        { error: "Missing songId or invalid seconds" },
        { status: 400 }
      );
    }

    const song = await loadSong(songId);
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const listenerWalletId = process.env.LISTENER_WALLET_ID;
    if (!listenerWalletId) {
      return NextResponse.json(
        { error: "Missing LISTENER_WALLET_ID" },
        { status: 500 }
      );
    }

    const client = getCircleClient();
    const totalAmount = parseFloat(song.pricePerSecond) * seconds;
    const collaborators = song.collaborators.filter((c) => c.address);

    if (collaborators.length === 0) {
      return NextResponse.json(
        { error: "No collaborators to pay" },
        { status: 400 }
      );
    }

    // Split equally among collaborators
    const splitPercentage = 100 / collaborators.length;
    const results = [];

    for (const collaborator of collaborators) {
      const shareAmount = ((totalAmount * splitPercentage) / 100).toFixed(6);
      const chain = collaborator.blockchain || "Arc_Testnet";

      console.log(
        `Paying ${shareAmount} USDC (${splitPercentage.toFixed(1)}%) to ${collaborator.artistName} (${collaborator.address}) on ${chain}`
      );

      try {
        if (requiresBridging(chain)) {
          // Cross-chain: Bridge USDC from Arc to destination chain via CCTP
          console.log(`  Bridging to ${chain}...`);

          const { apiKey, entitySecret } = getCircleCredentials();
          const kit = new BridgeKit();
          const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });

          const bridgeResult = await kit.bridge({
            from: {
              adapter,
              chain: SOURCE_CHAIN,
              address: SOURCE_WALLET_ADDRESS,
            },
            to: {
              adapter,
              chain,
              address: collaborator.address,
            },
            amount: shareAmount,
          });

          // Convert BigInt values for JSON serialization
          const safeResult = JSON.parse(
            JSON.stringify(bridgeResult, (_key, value) =>
              typeof value === "bigint" ? value.toString() : value
            )
          );

          console.log(`  Bridge initiated successfully`);
          results.push({
            artistName: collaborator.artistName,
            address: collaborator.address,
            percentage: splitPercentage,
            amount: shareAmount,
            chain,
            bridged: true,
            bridgeResult: safeResult,
            success: true,
          });
        } else {
          // Same chain: Direct transfer on Arc Testnet
          const response = await client.createTransaction({
            walletId: listenerWalletId,
            tokenId: USDC_TOKEN_ID,
            destinationAddress: collaborator.address,
            amounts: [shareAmount],
            fee: {
              type: "level",
              config: { feeLevel: "MEDIUM" },
            },
          });

          const txId = response.data?.id;
          results.push({
            artistName: collaborator.artistName,
            address: collaborator.address,
            percentage: splitPercentage,
            amount: shareAmount,
            chain,
            bridged: false,
            txId: txId || null,
            success: !!txId,
          });

          if (txId) {
            console.log(`  Transaction ID: ${txId}`);
          }
        }
      } catch (txError) {
        console.error(
          `  Failed to pay ${collaborator.artistName}:`,
          txError
        );
        results.push({
          artistName: collaborator.artistName,
          address: collaborator.address,
          percentage: splitPercentage,
          amount: shareAmount,
          chain,
          bridged: requiresBridging(chain),
          txId: null,
          success: false,
          error: "Transaction failed",
        });
      }
    }

    return NextResponse.json({
      songId: song.id,
      songName: song.songName,
      seconds,
      totalAmount: totalAmount.toFixed(6),
      payments: results,
      summary: {
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (error) {
    console.error("Payment error:", error);
    return NextResponse.json(
      { error: "Payment failed" },
      { status: 500 }
    );
  }
}
