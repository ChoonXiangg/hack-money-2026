import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getTierForSeconds } from "@/lib/sui";

const LISTENING_PATH = path.join(process.cwd(), "data", "listening.json");
const BADGES_PATH = path.join(process.cwd(), "data", "badges.json");

interface ArtistStats {
  address: string;
  totalSeconds: number;
  lastUpdated: string;
}

type ListeningData = Record<string, Record<string, ArtistStats>>;
type BadgesData = Record<string, { artistName: string; tier: number; badgeObjectId: string; txDigest: string; timestamp: string }[]>;

// GET: Top 10 listeners for an artist
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const artist = searchParams.get("artist");

    if (!artist) {
      return NextResponse.json(
        { error: "Missing artist query param" },
        { status: 400 }
      );
    }

    const listening: ListeningData = existsSync(LISTENING_PATH)
      ? JSON.parse(await readFile(LISTENING_PATH, "utf-8"))
      : {};

    const badges: BadgesData = existsSync(BADGES_PATH)
      ? JSON.parse(await readFile(BADGES_PATH, "utf-8"))
      : {};

    // Aggregate all listeners for this artist
    const listeners: {
      listenerAddress: string;
      totalSeconds: number;
      tier: number;
      hasBadge: boolean;
    }[] = [];

    for (const [listenerAddress, artists] of Object.entries(listening)) {
      if (artists[artist]) {
        const totalSeconds = artists[artist].totalSeconds;
        const tier = getTierForSeconds(totalSeconds);
        const listenerBadges = badges[listenerAddress] || [];
        const hasBadge = listenerBadges.some((b) => b.artistName === artist);

        listeners.push({ listenerAddress, totalSeconds, tier, hasBadge });
      }
    }

    // Sort by totalSeconds descending, take top 10
    listeners.sort((a, b) => b.totalSeconds - a.totalSeconds);
    const top10 = listeners.slice(0, 10);

    return NextResponse.json({ artist, listeners: top10 });
  } catch (error) {
    console.error("Top listeners error:", error);
    return NextResponse.json(
      { error: "Failed to fetch top listeners" },
      { status: 500 }
    );
  }
}
