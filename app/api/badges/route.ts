import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getTierName, getOwnedBadges } from "@/lib/sui";

const BADGES_PATH = path.join(process.cwd(), "data", "badges.json");

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

    const listenerBadges = (badges[listener] || []).map((b) => ({
      ...b,
      tierName: getTierName(b.tier),
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
