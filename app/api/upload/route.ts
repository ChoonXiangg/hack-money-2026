import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const SONGS_DATA_PATH = path.join(process.cwd(), "data", "songs.json");
const UPLOADS_PATH = path.join(process.cwd(), "public", "uploads");

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

async function ensureDirectories() {
  const dirs = [
    path.join(UPLOADS_PATH, "songs"),
    path.join(UPLOADS_PATH, "images"),
    path.dirname(SONGS_DATA_PATH),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}

async function loadSongsData(): Promise<SongData[]> {
  try {
    if (existsSync(SONGS_DATA_PATH)) {
      const data = await readFile(SONGS_DATA_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading songs data:", error);
  }
  return [];
}

async function saveSongsData(songs: SongData[]) {
  await writeFile(SONGS_DATA_PATH, JSON.stringify(songs, null, 2));
}

export async function POST(request: NextRequest) {
  try {
    await ensureDirectories();

    const formData = await request.formData();

    const songFile = formData.get("songFile") as File | null;
    const imageFile = formData.get("imageFile") as File | null;
    const songName = formData.get("songName") as string;
    const pricePerSecond = formData.get("pricePerSecond") as string;
    const collaboratorsJson = formData.get("collaborators") as string;

    if (!songFile || !songName || !pricePerSecond) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const collaborators: Collaborator[] = collaboratorsJson
      ? JSON.parse(collaboratorsJson)
      : [];

    // Generate unique ID
    const songId = `song-${Date.now()}`;

    // Save song file
    const songExt = songFile.name.split(".").pop() || "mp3";
    const songFileName = `${songId}.${songExt}`;
    const songFilePath = path.join(UPLOADS_PATH, "songs", songFileName);
    const songBuffer = Buffer.from(await songFile.arrayBuffer());
    await writeFile(songFilePath, songBuffer);

    // Save image file if provided
    let imageFileName = "";
    if (imageFile) {
      const imageExt = imageFile.name.split(".").pop() || "jpg";
      imageFileName = `${songId}.${imageExt}`;
      const imageFilePath = path.join(UPLOADS_PATH, "images", imageFileName);
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
      await writeFile(imageFilePath, imageBuffer);
    }

    // Create song data entry
    const newSong: SongData = {
      id: songId,
      songName,
      pricePerSecond,
      collaborators,
      songFile: `/uploads/songs/${songFileName}`,
      imageFile: imageFileName ? `/uploads/images/${imageFileName}` : "",
      createdAt: new Date().toISOString(),
    };

    // Load existing songs and add new one
    const songs = await loadSongsData();
    songs.push(newSong);
    await saveSongsData(songs);

    return NextResponse.json({
      success: true,
      song: newSong,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload song" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const songs = await loadSongsData();
    return NextResponse.json({ songs });
  } catch (error) {
    console.error("Error fetching songs:", error);
    return NextResponse.json(
      { error: "Failed to fetch songs" },
      { status: 500 }
    );
  }
}
