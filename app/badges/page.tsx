"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import StaggeredMenu from "@/components/StaggeredMenu";
import Grainient from "@/components/ui/Grainient";
import CircularGallery from "@/components/CircularGallery";

interface Badge {
  artistName: string;
  tier: number;
  tierName: string;
  badgeObjectId: string;
  txDigest: string;
  timestamp: string;
  totalSeconds: number;
}

function generateBadgeImage(tierName: string, artistName: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.font = '72px "Monsieur La Doulaise"';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(artistName, 400, 260);
  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(`${tierName} Badge`, 400, 360);
  return canvas.toDataURL();
}

export default function BadgesPage() {
  const [connected, setConnected] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontsReady, setFontsReady] = useState(false);

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
      image: generateBadgeImage(badge.tierName, badge.artistName),
      text: `${badge.tierName} Badge`,
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
