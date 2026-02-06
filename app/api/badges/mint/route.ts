import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  mintBadge,
  addListenTime,
  updateTier,
  getTierForSeconds,
  getTierName,
} from "@/lib/sui";

const LISTENING_PATH = path.join(process.cwd(), "data", "listening.json");
const BADGES_PATH = path.join(process.cwd(), "data", "badges.json");

interface ArtistStats {
  address: string;
  totalSeconds: number;
  lastUpdated: string;
}

type ListeningData = Record<string, Record<string, ArtistStats>>;

interface BadgeRecord {
  artistName: string;
  tier: number;
  badgeObjectId: string;
  txDigest: string;
  timestamp: string;
}

type BadgesData = Record<string, BadgeRecord[]>;

async function loadBadges(): Promise<BadgesData> {
  try {
    if (existsSync(BADGES_PATH)) {
      return JSON.parse(await readFile(BADGES_PATH, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {};
}

async function saveBadges(data: BadgesData) {
  await writeFile(BADGES_PATH, JSON.stringify(data, null, 2));
}

// POST: Mint or upgrade a badge for a listener
export async function POST(request: NextRequest) {
  try {
    const { listenerAddress, artistName } = await request.json();

    if (!listenerAddress || !artistName) {
      return NextResponse.json(
        { error: "Missing listenerAddress or artistName" },
        { status: 400 }
      );
    }

    // Load listening data to check eligibility
    const listening: ListeningData = existsSync(LISTENING_PATH)
      ? JSON.parse(await readFile(LISTENING_PATH, "utf-8"))
      : {};

    const listenerStats = listening[listenerAddress];
    if (!listenerStats || !listenerStats[artistName]) {
      return NextResponse.json(
        { error: "No listening data found for this artist" },
        { status: 400 }
      );
    }

    const totalSeconds = listenerStats[artistName].totalSeconds;
    const eligibleTier = getTierForSeconds(totalSeconds);

    if (eligibleTier === 0) {
      return NextResponse.json(
        { error: "Not enough listening time for a badge (need 1 minute)" },
        { status: 400 }
      );
    }

    // Check existing badges
    const badges = await loadBadges();
    if (!badges[listenerAddress]) badges[listenerAddress] = [];

    const existingBadge = badges[listenerAddress].find(
      (b) => b.artistName === artistName
    );

    if (existingBadge && existingBadge.tier >= eligibleTier) {
      return NextResponse.json({
        message: "Badge already at this tier or higher",
        badge: existingBadge,
        tierName: getTierName(existingBadge.tier),
      });
    }

    const artistAddress =
      listenerStats[artistName].address ||
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    if (existingBadge) {
      // Upgrade existing badge: add time and update tier on-chain
      console.log(
        `Upgrading badge for ${listenerAddress} → ${artistName} to tier ${eligibleTier}`
      );

      const addDigest = await addListenTime(
        existingBadge.badgeObjectId,
        totalSeconds
      );
      console.log(`  Added listen time, digest: ${addDigest}`);

      const tierDigest = await updateTier(existingBadge.badgeObjectId);
      console.log(`  Updated tier, digest: ${tierDigest}`);

      existingBadge.tier = eligibleTier;
      existingBadge.txDigest = tierDigest;
      existingBadge.timestamp = new Date().toISOString();

      await saveBadges(badges);

      return NextResponse.json({
        message: `Badge upgraded to ${getTierName(eligibleTier)}!`,
        badge: existingBadge,
        tierName: getTierName(eligibleTier),
        upgraded: true,
      });
    } else {
      // Mint new badge
      console.log(
        `Minting new badge for ${listenerAddress} → ${artistName} (${getTierName(eligibleTier)})`
      );

      // Use a valid Sui address format for the artist
      // If the artist has an EVM address, pad it to 32 bytes for Sui
      let suiArtistAddress = artistAddress;
      if (
        artistAddress.startsWith("0x") &&
        artistAddress.length === 42
      ) {
        // Pad EVM address (20 bytes) to Sui address (32 bytes)
        suiArtistAddress =
          "0x" + "0".repeat(24) + artistAddress.slice(2);
      }

      const { digest, badgeId } = await mintBadge(suiArtistAddress);
      console.log(`  Minted badge, digest: ${digest}, id: ${badgeId}`);

      if (badgeId && totalSeconds > 0) {
        // Add the accumulated listen time to the new badge
        const addDigest = await addListenTime(badgeId, totalSeconds);
        console.log(`  Added listen time, digest: ${addDigest}`);

        if (eligibleTier >= 2) {
          const tierDigest = await updateTier(badgeId);
          console.log(`  Updated tier, digest: ${tierDigest}`);
        }
      }

      const newBadge: BadgeRecord = {
        artistName,
        tier: eligibleTier,
        badgeObjectId: badgeId || "",
        txDigest: digest,
        timestamp: new Date().toISOString(),
      };

      badges[listenerAddress].push(newBadge);
      await saveBadges(badges);

      return NextResponse.json({
        message: `${getTierName(eligibleTier)} badge minted!`,
        badge: newBadge,
        tierName: getTierName(eligibleTier),
        upgraded: false,
      });
    }
  } catch (error) {
    console.error("Badge mint error:", error);
    return NextResponse.json(
      { error: "Failed to mint badge" },
      { status: 500 }
    );
  }
}
