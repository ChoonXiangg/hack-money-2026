import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const LISTENING_PATH = path.join(process.cwd(), "data", "listening.json");

interface ArtistStats {
  address: string;
  totalSeconds: number;
  lastUpdated: string;
}

type ListeningData = Record<string, Record<string, ArtistStats>>;

// GET: Retrieve top listeners for an artist address
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

    const listeners: {
      address: string;
      totalSeconds: number;
      artistName: string;
    }[] = [];

    // Scan all listeners for those who listened to this artist address
    for (const [listenerAddr, artists] of Object.entries(listening)) {
      for (const [artistName, stats] of Object.entries(artists)) {
        if (stats.address.toLowerCase() === artist.toLowerCase()) {
          listeners.push({
            address: listenerAddr,
            totalSeconds: stats.totalSeconds,
            artistName,
          });
        }
      }
    }

    // Sort by totalSeconds descending, take top 10
    listeners.sort((a, b) => b.totalSeconds - a.totalSeconds);
    const top10 = listeners.slice(0, 10);

    return NextResponse.json({ artist, listeners: top10 });
  } catch (error) {
    console.error("Top listeners fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch top listeners" },
      { status: 500 }
    );
  }
}
