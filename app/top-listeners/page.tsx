"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import StaggeredMenu from "@/components/StaggeredMenu";

import AnimatedList from "@/components/AnimatedList";

interface Song {
  id: string;
  collaborators: { address: string }[];
}

interface Listener {
  address: string;
  totalSeconds: number;
  artistName: string;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export default function TopListenersPage() {
  const [connected, setConnected] = useState(false);
  const [hasSongs, setHasSongs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listeners, setListeners] = useState<Listener[]>([]);

  const checkWallet = useCallback(() => {
    setConnected(!!localStorage.getItem("walletAddress"));
  }, []);

  useEffect(() => {
    checkWallet();
    window.addEventListener("walletChanged", checkWallet);
    return () => window.removeEventListener("walletChanged", checkWallet);
  }, [checkWallet]);

  useEffect(() => {
    const addr = localStorage.getItem("walletAddress");
    if (!addr) {
      setHasSongs(false);
      setListeners([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/upload")
      .then((r) => r.json())
      .then(async (data) => {
        const songs: Song[] = data.songs || [];
        const owns = songs.some((s) =>
          s.collaborators.some(
            (c) => c.address.toLowerCase() === addr.toLowerCase()
          )
        );
        setHasSongs(owns);

        if (owns) {
          const res = await fetch(`/api/top-listeners?artist=${addr}`);
          const result = await res.json();
          setListeners(result.listeners || []);
        } else {
          setListeners([]);
        }
      })
      .catch(() => {
        setHasSongs(false);
        setListeners([]);
      })
      .finally(() => setLoading(false));
  }, [connected]);

  return (
    <div className="relative min-h-screen">
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
      <div className="relative z-10 px-2 pt-32 pb-8">
        <h1 className="mb-8 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          My Top Listeners
        </h1>

        {!connected && (
          <p className="text-center text-lg text-black/70">
            Connect your wallet to view your top listeners.
          </p>
        )}

        {connected && !loading && !hasSongs && (
          <p className="text-center text-lg text-black/70">
            <Link href="/upload" className="underline text-black hover:opacity-70 transition-opacity">
              Upload
            </Link>{" "}
            a song to earn listeners.
          </p>
        )}

        {connected && !loading && hasSongs && listeners.length === 0 && (
          <p className="text-center text-lg text-black/70">
            No listeners yet. Share your music to grow your audience!
          </p>
        )}

        {connected && !loading && listeners.length > 0 && (
          <AnimatedList
            items={listeners.map(
              (l, i) => `${i + 1}|${l.address}|${formatTime(l.totalSeconds)}`
            )}
            renderItem={(item) => {
              const [rank, address, time] = item.split("|");
              return (
                <div className="flex items-center gap-4 font-[family-name:var(--font-climate)]">
                  <span className="text-3xl text-black/40 w-10">{rank}</span>
                  <span className="flex-1 min-w-0 text-xl text-black truncate">{address}</span>
                  <span className="text-xl text-black/70 whitespace-nowrap">{time}</span>
                </div>
              );
            }}
            showGradients={false}
            enableArrowNavigation
            displayScrollbar
          />
        )}
      </div>
    </div>
  );
}
