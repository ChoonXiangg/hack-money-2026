import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getTierName, getOwnedBadges } from "@/lib/sui";

const BADGES_PATH = path.join(process.cwd(), "data", "badges.json");
const LISTENING_PATH = path.join(process.cwd(), "data", "listening.json");

interface BadgeRecord {
  artistName: string;
  tier: number;
  badgeObjectId: string;
  txDigest: string;
  timestamp: string;
}

type BadgesData = Record<string, BadgeRecord[]>;

// GET: Retrieve badges for a listener
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const listener = searchParams.get("listener");

    if (!listener) {
      return NextResponse.json(
        { error: "Missing listener query param" },
        { status: 400 }
      );
    }

    // Load off-chain badge records
    const badges: BadgesData = existsSync(BADGES_PATH)
      ? JSON.parse(await readFile(BADGES_PATH, "utf-8"))
      : {};

    const key = Object.keys(badges).find(
      (k) => k.toLowerCase() === listener.toLowerCase()
    );

    // Load listening data
    const listening: Record<string, Record<string, { address: string; totalSeconds: number }>> =
      existsSync(LISTENING_PATH)
        ? JSON.parse(await readFile(LISTENING_PATH, "utf-8"))
        : {};
    const listenKey = Object.keys(listening).find(
      (k) => k.toLowerCase() === listener.toLowerCase()
    );
    const listenerListening = listenKey ? listening[listenKey] : {};

    const listenerBadges = (key ? badges[key] : []).map((b) => ({
      ...b,
      tierName: getTierName(b.tier),
      totalSeconds: listenerListening[b.artistName]?.totalSeconds || 0,
      artistAddress: listenerListening[b.artistName]?.address || "",
    }));

    // Also try to verify on-chain (using admin address since badges are owned by admin)
    let onChainBadges: Awaited<ReturnType<typeof getOwnedBadges>> = [];
    try {
      const adminAddress = process.env.SUI_ADMIN_ADDRESS;
      if (adminAddress) {
        onChainBadges = await getOwnedBadges(adminAddress);
      }
    } catch {
      // On-chain query failed, just use off-chain data
    }

    return NextResponse.json({
      listener,
      badges: listenerBadges,
      onChainCount: onChainBadges.length,
    });
  } catch (error) {
    console.error("Badges fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch badges" },
      { status: 500 }
    );
  }
}
