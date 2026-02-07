"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import StaggeredMenu from "@/components/StaggeredMenu";
import Grainient from "@/components/ui/Grainient";
import CircularGallery from "@/components/CircularGallery";

interface Badge {
  artistName: string;
  artistAddress: string;
  tier: number;
  tierName: string;
  badgeObjectId: string;
  txDigest: string;
  timestamp: string;
  totalSeconds: number;
}

const tierColors: Record<string, { bg: string; text: string; sub: string }> = {
  Bronze: { bg: "#CD7F32", text: "#3E2723", sub: "rgba(62,39,35,0.6)" },
  Silver: { bg: "#C0C0C0", text: "#212121", sub: "rgba(33,33,33,0.6)" },
  Gold:   { bg: "#FFD700", text: "#4E3B00", sub: "rgba(78,59,0,0.6)" },
};

const NEXT_TIER: Record<string, { name: string; threshold: number }> = {
  Bronze: { name: "Silver", threshold: 3600 },
  Silver: { name: "Gold", threshold: 36000 },
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

function truncateAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function generateBadgeImage(badge: Badge): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  const colors = tierColors[badge.tierName] || tierColors.Bronze;

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, 800, 600);

  // Artist name
  ctx.fillStyle = colors.text;
  ctx.font = '72px "Monsieur La Doulaise"';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge.artistName, 400, 180);

  // Tier label
  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = colors.sub;
  ctx.fillText(`${badge.tierName} Badge`, 400, 270);

  // Info lines
  ctx.font = "20px sans-serif";
  ctx.fillStyle = colors.text;
  ctx.fillText(`Artist: ${truncateAddr(badge.artistAddress)}`, 400, 350);
  ctx.fillText(`Listened: ${formatTime(badge.totalSeconds)}`, 400, 390);

  const next = NEXT_TIER[badge.tierName];
  if (next) {
    const remaining = Math.max(0, next.threshold - badge.totalSeconds);
    ctx.fillText(`${formatTime(remaining)} to ${next.name}`, 400, 430);
  } else {
    ctx.fillText("Max tier reached!", 400, 430);
  }

  return canvas.toDataURL();
}

export default function BadgesPage() {
  const [connected, setConnected] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontsReady, setFontsReady] = useState(false);

  const badgesRef = useRef(badges);
  badgesRef.current = badges;

  const handleBadgeClick = useCallback((index: number) => {
    const badge = badgesRef.current[index];
    if (badge?.badgeObjectId) {
      window.open(
        `https://suiscan.xyz/testnet/object/${badge.badgeObjectId}`,
        "_blank"
      );
    }
  }, []);

  const checkWallet = useCallback(() => {
    setConnected(!!localStorage.getItem("walletAddress"));
  }, []);

  const fetchBadges = useCallback(() => {
    const addr = localStorage.getItem("walletAddress");
    if (!addr) {
      setBadges([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/badges?listener=${addr}`)
      .then((r) => r.json())
      .then((data) => {
        setBadges(data.badges || []);
      })
      .catch(() => setBadges([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    checkWallet();
    fetchBadges();
    const handler = () => { checkWallet(); fetchBadges(); };
    window.addEventListener("walletChanged", handler);
    return () => window.removeEventListener("walletChanged", handler);
  }, [checkWallet, fetchBadges]);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const galleryItems = useMemo(() => {
    if (!fontsReady || badges.length === 0) return [];
    return badges.map((badge) => ({
      image: generateBadgeImage(badge),
      text: "",
    }));
  }, [badges, fontsReady]);

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
          { label: "My Badges", ariaLabel: "View your badges", link: "/badges" },
          { label: "My Top Listeners", ariaLabel: "View your top listeners", link: "/top-listeners" },
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
      <div className="relative z-10 px-6 pt-32 pb-8">
        <h1 className="mb-8 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          My Badges
        </h1>

        {!connected && (
          <p className="text-center text-lg text-black/70">
            Connect your wallet to view your badges.
          </p>
        )}

        {connected && !loading && badges.length === 0 && (
          <p className="text-center text-lg text-black/70">
            You do not have badges yet,{" "}
            <Link href="/" className="underline text-black hover:opacity-70 transition-opacity">
              listen
            </Link>{" "}
            to an artist to earn his badge.
          </p>
        )}

        {badges.length > 0 && galleryItems.length > 0 && (
          <div style={{ height: "600px", position: "relative" }}>
            <CircularGallery
              items={galleryItems}
              bend={1}
              textColor="#000000"
              borderRadius={0.05}
              scrollSpeed={2}
              scrollEase={0.05}
              onItemClick={handleBadgeClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
