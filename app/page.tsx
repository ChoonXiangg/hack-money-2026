"use client";

import { useEffect, useState } from "react";
import StaggeredMenu from "@/components/StaggeredMenu";
import TiltedCard from "@/components/TiltedCard";
import ConnectWallet from "@/components/ConnectWallet";
import Grainient from "@/components/ui/Grainient";

interface Song {
  id: string;
  songName: string;
  pricePerSecond: string;
  collaborators: { artistName: string; address: string; blockchain: string }[];
  songFile: string;
  imageFile: string;
  createdAt: string;
}

const menuItems = [
  { label: "Upload Song", ariaLabel: "Upload a new song", link: "/upload" },
];

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    fetch("/api/upload")
      .then((res) => res.json())
      .then((data) => setSongs(data.songs || []))
      .catch(console.error);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Grainient Background */}
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
        items={menuItems}
        displaySocials={false}
        displayItemNumbering={false}
        menuButtonColor="#000000"
        openMenuButtonColor="#fff"
        changeMenuColorOnOpen
        colors={["#B19EEF", "#5227FF"]}
        accentColor="#5227FF"
        isFixed
        logoElement={<ConnectWallet />}
        centerElement={
          <span className="font-[family-name:var(--font-climate)] text-3xl text-black">
            LeStream
          </span>
        }
      />

      {/* Main Content */}
      <div className="relative z-10 px-8 pt-32 pb-16">
        <h2 className="mb-12 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          New Releases
        </h2>

        {songs.length === 0 ? (
          <p className="text-center text-lg text-black/60">
            No songs yet. Upload your first track!
          </p>
        ) : (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-12">
            {songs.map((song) => {
              const artistNames = song.collaborators
                .map((c) => c.artistName)
                .filter(Boolean)
                .join(", ");
              const caption = artistNames
                ? `${song.songName} - ${artistNames}`
                : song.songName;

              return (
                <TiltedCard
                  key={song.id}
                  imageSrc={song.imageFile || "/placeholder.svg"}
                  altText={song.songName}
                  captionText={caption}
                  containerHeight="300px"
                  containerWidth="300px"
                  imageHeight="300px"
                  imageWidth="300px"
                  rotateAmplitude={12}
                  scaleOnHover={1.05}
                  showMobileWarning={false}
                  showTooltip
                  displayOverlayContent
                  overlayContent={
                    <div className="flex h-[300px] w-[300px] flex-col justify-end rounded-[15px] bg-gradient-to-t from-black/70 to-transparent p-5">
                      <p className="text-lg font-bold text-white">
                        {song.songName}
                      </p>
                      {artistNames && (
                        <p className="text-sm text-white/80">{artistNames}</p>
                      )}
                      <p className="mt-1 text-xs text-white/60">
                        {song.pricePerSecond} USDC/sec
                      </p>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
