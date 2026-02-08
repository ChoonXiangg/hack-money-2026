"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Trophy, Award, Clock } from "lucide-react";
import ConnectWallet from "@/components/ConnectWallet";
import StaggeredMenu from "@/components/StaggeredMenu";
import Grainient from "@/components/ui/Grainient";

interface Listener {
  listenerAddress: string;
  totalSeconds: number;
  tier: number;
  hasBadge: boolean;
}

const TIER_NAMES: Record<number, string> = {
  0: "None",
  1: "Bronze",
  2: "Silver",
  3: "Gold",
};

const TIER_COLORS: Record<number, string> = {
  1: "text-amber-700",
  2: "text-gray-500",
  3: "text-yellow-500",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ArtistPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const artistName = decodeURIComponent(name);
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/listening/top?artist=${encodeURIComponent(artistName)}`)
      .then((r) => r.json())
      .then((data) => setListeners(data.listeners || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [artistName]);

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

      {/* Navigation Header with StaggeredMenu */}
      <StaggeredMenu
        position="right"
        items={[
          { label: "Upload Song", ariaLabel: "Upload a new song", link: "/upload" },
        ]}
        displaySocials={false}
        displayItemNumbering={false}
        menuButtonColor="#000000"
        openMenuButtonColor="#fff"
        changeMenuColorOnOpen
        colors={["#B19EEF", "#5227FF"]}
        accentColor="#5227FF"
        isFixed
        logoElement={
          <div className="flex items-center gap-3">
            <ConnectWallet />
            <Link href="/" className="font-[family-name:var(--font-climate)] text-3xl text-black transition-opacity hover:opacity-70">
              LeStream
            </Link>
          </div>
        }
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-2xl px-6 pt-32 pb-8">
        <h1 className="mb-2 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          {artistName}
        </h1>
        <p className="mb-10 text-center text-lg text-black/60">
          Top Listeners
        </p>

        {loading ? (
          <p className="text-center text-lg text-black/60">Loading...</p>
        ) : listeners.length === 0 ? (
          <div className="rounded-2xl bg-black/10 p-8 text-center backdrop-blur-sm">
            <p className="text-lg text-black/70">
              No listeners yet. Be the first!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listeners.map((listener, i) => (
              <div
                key={listener.listenerAddress}
                className="flex items-center gap-4 rounded-xl bg-black/10 p-4 backdrop-blur-sm"
              >
                {/* Rank */}
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-bold ${
                    i === 0
                      ? "bg-yellow-400/30 text-yellow-800"
                      : i === 1
                        ? "bg-gray-300/30 text-gray-700"
                        : i === 2
                          ? "bg-amber-600/20 text-amber-800"
                          : "bg-black/10 text-black/50"
                  }`}
                >
                  {i === 0 ? (
                    <Trophy className="h-5 w-5" />
                  ) : (
                    `#${i + 1}`
                  )}
                </div>

                {/* Address + Time */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-black">
                    {listener.listenerAddress.slice(0, 6)}...
                    {listener.listenerAddress.slice(-4)}
                  </p>
                  <div className="flex items-center gap-1 text-sm text-black/60">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(listener.totalSeconds)}
                  </div>
                </div>

                {/* Badge */}
                {listener.tier > 0 && (
                  <div
                    className={`flex items-center gap-1 text-sm font-medium ${TIER_COLORS[listener.tier] || "text-black/50"}`}
                  >
                    <Award className="h-4 w-4" />
                    {TIER_NAMES[listener.tier]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
