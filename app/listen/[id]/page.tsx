"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Pause, CheckCircle, XCircle, AlertTriangle, Award } from "lucide-react";
import ConnectWallet from "@/components/ConnectWallet";
import StaggeredMenu from "@/components/StaggeredMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Grainient from "@/components/ui/Grainient";
import ElasticSlider from "@/components/ElasticSlider";

interface Song {
  id: string;
  songName: string;
  pricePerSecond: string;
  collaborators: { artistName: string; address: string; blockchain: string; percentage?: number }[];
  songFile: string;
  imageFile: string;
  createdAt: string;
}

export default function ListenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [song, setSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [secondsListened, setSecondsListened] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaying, setIsPaying] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupStatus, setPopupStatus] = useState<"success" | "partial" | "error">("success");
  const [popupMessage, setPopupMessage] = useState("");
  const [popupDetails, setPopupDetails] = useState("");
  const [earnedBadges, setEarnedBadges] = useState<{ artistName: string; tierName: string }[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/upload")
      .then((res) => res.json())
      .then((data) => {
        const found = (data.songs || []).find((s: Song) => s.id === id);
        setSong(found || null);
      })
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handlePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
      timerRef.current = setInterval(() => {
        setSecondsListened((prev) => prev + 1);
      }, 1000);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSliderChange = (value: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = value;
      setCurrentTime(value);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const showPopup = (status: "success" | "partial" | "error", message: string, details: string) => {
    setPopupStatus(status);
    setPopupMessage(message);
    setPopupDetails(details);
    setPopupOpen(true);
  };

  const handleFinishAndPay = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (secondsListened <= 0) {
      showPopup("error", "No listening time", "You haven't listened to any of the song yet!");
      return;
    }

    setIsPaying(true);
    setEarnedBadges([]);
    try {
      // 1. Process payment
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: id, seconds: secondsListened }),
      });

      const data = await res.json();

      if (!res.ok) {
        showPopup("error", "Payment Failed", data.error || "Unknown error");
        return;
      }

      const successCount = data.summary?.successful || 0;
      const failCount = data.summary?.failed || 0;
      const totalPaid = data.totalAmount || "0";

      // 2. Persist listening time
      const listenerAddress = typeof window !== "undefined"
        ? localStorage.getItem("walletAddress") || "anonymous"
        : "anonymous";

      let badgesEarned: { artistName: string; tierName: string }[] = [];

      try {
        const listenRes = await fetch("/api/listening", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listenerAddress,
            songId: id,
            seconds: secondsListened,
          }),
        });

        const listenData = await listenRes.json();

        // 3. Check and mint badges for newly eligible artists
        if (listenData.newBadgeEligibility?.length > 0) {
          for (const eligible of listenData.newBadgeEligibility) {
            try {
              const mintRes = await fetch("/api/badges/mint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  listenerAddress,
                  artistName: eligible.artistName,
                }),
              });
              const mintData = await mintRes.json();
              if (mintRes.ok && mintData.tierName) {
                badgesEarned.push({
                  artistName: eligible.artistName,
                  tierName: mintData.tierName,
                });
              }
            } catch {
              // Badge minting failed, don't block the flow
            }
          }
        }
      } catch {
        // Listening persistence failed, don't block the flow
      }

      setEarnedBadges(badgesEarned);

      if (failCount > 0) {
        showPopup(
          "partial",
          "Partial Payment",
          `${successCount} succeeded, ${failCount} failed.\n${totalPaid} USDC for ${secondsListened}s of "${song?.songName}"`
        );
      } else {
        showPopup(
          "success",
          "Payment Successful",
          `${totalPaid} USDC paid for ${secondsListened}s of "${song?.songName}"`
        );
      }
    } catch (error) {
      console.error("Payment error:", error);
      showPopup("error", "Payment Failed", "Something went wrong. Please try again.");
    } finally {
      setIsPaying(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!song) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
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
        <p className="relative z-10 text-xl text-black/60">Loading...</p>
      </div>
    );
  }

  const pricePerSecond = parseFloat(song.pricePerSecond);
  const total = pricePerSecond * secondsListened;

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

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={song.songFile}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

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
      <div className="relative z-10 flex min-h-screen flex-col items-center px-8 pt-32 pb-16">
        {/* Song Name */}
        <h1 className="mb-12 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          {song.songName}
        </h1>

        {/* Centered Layout */}
        <div className="flex flex-col items-center gap-6">
          {/* Song Image */}
          <div className="relative overflow-hidden rounded-2xl shadow-2xl">
            <img
              src={song.imageFile || "/placeholder.svg"}
              alt={song.songName}
              className="h-[500px] w-[500px] object-cover"
            />
            {/* Play/Pause overlay */}
            <button
              onClick={handlePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all hover:bg-black/20"
            >
              <div className="rounded-full bg-black/50 p-5 opacity-0 backdrop-blur-sm transition-opacity hover:opacity-100 group-hover:opacity-100 [button:hover_&]:opacity-100">
                {isPlaying ? (
                  <Pause className="h-12 w-12 text-white" />
                ) : (
                  <Play className="h-12 w-12 text-white" />
                )}
              </div>
            </button>
          </div>

          {/* Time Display */}
          <div className="flex w-[500px] items-center justify-between text-base text-black/70">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Elastic Slider for song progress */}
          <div className="w-[500px]">
            <ElasticSlider
              leftIcon={
                <button onClick={handlePlay} className="text-black/70 hover:text-black">
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
              }
              rightIcon={<span />}
              startingValue={0}
              defaultValue={currentTime}
              maxValue={duration || 100}
              isStepped={false}
              stepSize={1}
              onChange={handleSliderChange}
            />
          </div>

          {/* Finish and Pay Button */}
          <Button
            onClick={handleFinishAndPay}
            disabled={isPaying}
            className="mt-4 w-[500px] bg-black px-12 py-7 font-[family-name:var(--font-climate)] text-2xl text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-black hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
          >
            {isPaying ? "Paying..." : "Finish and Pay"}
          </Button>
        </div>
      </div>

      {/* Payment Result Popup */}
      <Dialog open={popupOpen} onOpenChange={(open) => {
        setPopupOpen(open);
        if (!open && popupStatus !== "error") {
          router.push("/");
        }
      }}>
        <DialogContent className="border-black/20 bg-white/90 backdrop-blur-md">
          <DialogHeader>
            <div className="mx-auto mb-2">
              {popupStatus === "success" && <CheckCircle className="h-12 w-12 text-green-600" />}
              {popupStatus === "partial" && <AlertTriangle className="h-12 w-12 text-yellow-600" />}
              {popupStatus === "error" && <XCircle className="h-12 w-12 text-red-600" />}
            </div>
            <DialogTitle className="text-center text-xl text-black">
              {popupMessage}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line text-center text-black/70">
              {popupDetails}
            </DialogDescription>
          </DialogHeader>
          {earnedBadges.length > 0 && (
            <div className="mx-auto mt-2 space-y-2">
              {earnedBadges.map((badge, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm"
                >
                  <Award className="h-5 w-5 text-amber-600" />
                  <span className="text-black/80">
                    <strong>{badge.tierName}</strong> badge earned for{" "}
                    <strong>{badge.artistName}</strong>!
                  </span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => {
                setPopupOpen(false);
                if (popupStatus !== "error") {
                  router.push("/");
                }
              }}
              className="bg-black px-8 py-2 text-white transition-all duration-300 hover:scale-105 hover:bg-black hover:shadow-lg"
            >
              {popupStatus === "error" ? "Close" : "Back to Home"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
