import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getTierForSeconds } from "@/lib/sui";

const LISTENING_PATH = path.join(process.cwd(), "data", "listening.json");
const SONGS_PATH = path.join(process.cwd(), "data", "songs.json");

interface ArtistStats {
  address: string;
  totalSeconds: number;
  lastUpdated: string;
}

type ListeningData = Record<string, Record<string, ArtistStats>>;

interface SongCollaborator {
  artistName: string;
  address: string;
  blockchain: string;
  percentage?: number;
}

interface SongData {
  id: string;
  songName: string;
  collaborators: SongCollaborator[];
}

async function loadListening(): Promise<ListeningData> {
  try {
    if (existsSync(LISTENING_PATH)) {
      const data = await readFile(LISTENING_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // ignore
  }
  return {};
}

async function saveListening(data: ListeningData) {
  await writeFile(LISTENING_PATH, JSON.stringify(data, null, 2));
}

async function loadSong(songId: string): Promise<SongData | null> {
  if (!existsSync(SONGS_PATH)) return null;
  const data = await readFile(SONGS_PATH, "utf-8");
  const songs: SongData[] = JSON.parse(data);
  return songs.find((s) => s.id === songId) || null;
}

// POST: Record listening time
export async function POST(request: NextRequest) {
  try {
    const { listenerAddress, songId, seconds } = await request.json();

    if (!listenerAddress || !songId || !seconds || seconds <= 0) {
      return NextResponse.json(
        { error: "Missing listenerAddress, songId, or invalid seconds" },
        { status: 400 }
      );
    }

    const song = await loadSong(songId);
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const listening = await loadListening();
    if (!listening[listenerAddress]) {
      listening[listenerAddress] = {};
    }

    const newBadgeEligibility: {
      artistName: string;
      previousTier: number;
      newTier: number;
    }[] = [];

    // Add seconds to each artist on the song
    for (const collab of song.collaborators) {
      const artistName = collab.artistName;
      if (!listening[listenerAddress][artistName]) {
        listening[listenerAddress][artistName] = {
          address: collab.address,
          totalSeconds: 0,
          lastUpdated: new Date().toISOString(),
        };
      }

      const prev = listening[listenerAddress][artistName].totalSeconds;
      const prevTier = getTierForSeconds(prev);

      listening[listenerAddress][artistName].totalSeconds += seconds;
      listening[listenerAddress][artistName].lastUpdated =
        new Date().toISOString();

      const newTotal = listening[listenerAddress][artistName].totalSeconds;
      const newTier = getTierForSeconds(newTotal);

      if (newTier > prevTier) {
        newBadgeEligibility.push({
          artistName,
          previousTier: prevTier,
          newTier,
        });
      }
    }

    await saveListening(listening);

    return NextResponse.json({
      listener: listenerAddress,
      artists: listening[listenerAddress],
      newBadgeEligibility,
    });
  } catch (error) {
    console.error("Listening error:", error);
    return NextResponse.json(
      { error: "Failed to record listening time" },
      { status: 500 }
    );
  }
}

// GET: Retrieve listening stats for a listener
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

    const listening = await loadListening();
    const stats = listening[listener] || {};

    // Add tier info to each artist
    const artistStats = Object.entries(stats).map(([artistName, data]) => ({
      artistName,
      address: data.address,
      totalSeconds: data.totalSeconds,
      currentTier: getTierForSeconds(data.totalSeconds),
      lastUpdated: data.lastUpdated,
    }));

    return NextResponse.json({ listener, artists: artistStats });
  } catch (error) {
    console.error("Listening fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch listening stats" },
      { status: 500 }
    );
  }
}
