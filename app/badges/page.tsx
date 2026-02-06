"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Clock, Trophy } from "lucide-react";
import Grainient from "@/components/ui/Grainient";

interface ArtistStat {
  artistName: string;
  address: string;
  totalSeconds: number;
  currentTier: number;
  lastUpdated: string;
}

interface Badge {
  artistName: string;
  tier: number;
  tierName: string;
  badgeObjectId: string;
  txDigest: string;
  timestamp: string;
}

const TIER_COLORS: Record<number, string> = {
  1: "from-amber-700 to-amber-900",
  2: "from-gray-300 to-gray-500",
  3: "from-yellow-400 to-amber-500",
};

const TIER_NAMES: Record<number, string> = {
  0: "None",
  1: "Bronze",
  2: "Silver",
  3: "Gold",
};

const TIER_THRESHOLDS = {
  bronze: 60,
  silver: 3600,
  gold: 36000,
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getNextTierInfo(currentTier: number, totalSeconds: number) {
  if (currentTier >= 3) return { nextTier: "Max", progress: 100, remaining: 0 };

  let target: number;
  let nextTier: string;

  if (currentTier === 0) {
    target = TIER_THRESHOLDS.bronze;
    nextTier = "Bronze";
  } else if (currentTier === 1) {
    target = TIER_THRESHOLDS.silver;
    nextTier = "Silver";
  } else {
    target = TIER_THRESHOLDS.gold;
    nextTier = "Gold";
  }

  const progress = Math.min(100, (totalSeconds / target) * 100);
  const remaining = Math.max(0, target - totalSeconds);
  return { nextTier, progress, remaining };
}

export default function BadgesPage() {
  const [listenerAddress, setListenerAddress] = useState<string>("");
  const [artists, setArtists] = useState<ArtistStat[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const addr = localStorage.getItem("walletAddress") || "";
    setListenerAddress(addr);

    if (addr) {
      Promise.all([
        fetch(`/api/listening?listener=${addr}`).then((r) => r.json()),
        fetch(`/api/badges?listener=${addr}`).then((r) => r.json()),
      ])
        .then(([listenData, badgeData]) => {
          setArtists(listenData.artists || []);
          setBadges(badgeData.badges || []);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0">
        <Grainient
          color1="#FF9FFC"
          color2="#8B5CF6"
          color3="#5227FF"
          timeSpeed={0.15}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={1.5}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.08}
          grainScale={2}
          grainAnimated={false}
          contrast={1.4}
          gamma={1}
          saturation={1.1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 px-8 pt-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-climate)] text-2xl text-black transition-opacity hover:opacity-70"
        >
          LeStream
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          My Badges
        </h1>

        {!listenerAddress ? (
          <div className="rounded-2xl bg-black/10 p-8 text-center backdrop-blur-sm">
            <p className="text-lg text-black/70">
              Connect your wallet on the home page to view your badges.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block font-medium text-black underline"
            >
              Go to Home
            </Link>
          </div>
        ) : loading ? (
          <p className="text-center text-lg text-black/60">Loading...</p>
        ) : (
          <>
            {/* Badges Section */}
            <section className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-black">
                <Trophy className="h-6 w-6" />
                Earned Badges
              </h2>

              {badges.length === 0 ? (
                <div className="rounded-xl bg-black/10 p-6 text-center backdrop-blur-sm">
                  <p className="text-black/60">
                    No badges earned yet. Listen to songs to earn badges!
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {badges.map((badge, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 rounded-xl bg-black/10 p-4 backdrop-blur-sm"
                    >
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${TIER_COLORS[badge.tier] || "from-gray-400 to-gray-600"}`}
                      >
                        <Award className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-black">
                          {badge.tierName} Fan
                        </p>
                        <p className="text-sm text-black/60">
                          {badge.artistName}
                        </p>
                        {badge.badgeObjectId && (
                          <p className="mt-1 font-mono text-xs text-black/40">
                            {badge.badgeObjectId.slice(0, 10)}...
                            {badge.badgeObjectId.slice(-6)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Artist Listening Stats */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-black">
                <Clock className="h-6 w-6" />
                Listening Stats
              </h2>

              {artists.length === 0 ? (
                <div className="rounded-xl bg-black/10 p-6 text-center backdrop-blur-sm">
                  <p className="text-black/60">
                    No listening history yet. Start streaming!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {artists
                    .sort((a, b) => b.totalSeconds - a.totalSeconds)
                    .map((artist) => {
                      const { nextTier, progress, remaining } = getNextTierInfo(
                        artist.currentTier,
                        artist.totalSeconds
                      );

                      return (
                        <div
                          key={artist.artistName}
                          className="rounded-xl bg-black/10 p-5 backdrop-blur-sm"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <Link
                                href={`/artist/${encodeURIComponent(artist.artistName)}`}
                                className="text-lg font-bold text-black hover:underline"
                              >
                                {artist.artistName}
                              </Link>
                              <p className="text-sm text-black/60">
                                {formatDuration(artist.totalSeconds)} listened
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-medium ${
                                artist.currentTier === 3
                                  ? "bg-yellow-400/30 text-yellow-800"
                                  : artist.currentTier === 2
                                    ? "bg-gray-300/30 text-gray-700"
                                    : artist.currentTier === 1
                                      ? "bg-amber-600/20 text-amber-800"
                                      : "bg-black/10 text-black/50"
                              }`}
                            >
                              {TIER_NAMES[artist.currentTier]}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="mt-3">
                            <div className="mb-1 flex justify-between text-xs text-black/50">
                              <span>
                                {artist.currentTier < 3
                                  ? `${Math.round(progress)}% to ${nextTier}`
                                  : "Max tier reached!"}
                              </span>
                              {remaining > 0 && (
                                <span>{formatDuration(remaining)} left</span>
                              )}
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-black/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
