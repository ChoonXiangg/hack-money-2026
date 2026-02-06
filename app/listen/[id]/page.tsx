"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import Grainient from "@/components/ui/Grainient";
import ElasticSlider from "@/components/ElasticSlider";
import Counter from "@/components/Counter";

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

  const handleFinishAndPay = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (secondsListened <= 0) {
      alert("You haven't listened to any of the song yet!");
      return;
    }

    setIsPaying(true);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: id, seconds: secondsListened }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Payment failed: ${data.error || "Unknown error"}`);
        return;
      }

      const successCount = data.summary?.successful || 0;
      const failCount = data.summary?.failed || 0;
      const totalPaid = data.totalAmount || "0";

      if (failCount > 0) {
        alert(
          `Partial payment: ${successCount} succeeded, ${failCount} failed.\nTotal: ${totalPaid} USDC for ${secondsListened}s of "${song?.songName}"`
        );
      } else {
        alert(
          `Payment successful! ${totalPaid} USDC paid for ${secondsListened}s of "${song?.songName}"`
        );
      }

      router.push("/");
    } catch (error) {
      console.error("Payment error:", error);
      alert("Payment failed. Please try again.");
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

      {/* Header */}
      <div className="relative z-10 px-8 pt-6">
        <Link href="/" className="font-[family-name:var(--font-climate)] text-2xl text-black transition-opacity hover:opacity-70">
          LeStream
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center px-8 pt-8 pb-16">
        {/* Song Name */}
        <h1 className="mb-16 text-center font-[family-name:var(--font-climate)] text-5xl text-black">
          {song.songName}
        </h1>

        {/* Main Layout: Image + Slider (left) | Stats (right) */}
        <div className="flex w-full max-w-5xl flex-col items-center gap-16 lg:flex-row lg:items-start lg:justify-center lg:gap-24">
          {/* Left: Song Image + Slider */}
          <div className="flex flex-col items-center gap-6">
            {/* Song Image */}
            <div className="relative overflow-hidden rounded-2xl shadow-2xl">
              <img
                src={song.imageFile || "/placeholder.svg"}
                alt={song.songName}
                className="h-[400px] w-[400px] object-cover"
              />
              {/* Play/Pause overlay */}
              <button
                onClick={handlePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all hover:bg-black/20"
              >
                <div className="rounded-full bg-black/50 p-4 opacity-0 backdrop-blur-sm transition-opacity hover:opacity-100 group-hover:opacity-100 [button:hover_&]:opacity-100">
                  {isPlaying ? (
                    <Pause className="h-10 w-10 text-white" />
                  ) : (
                    <Play className="h-10 w-10 text-white" />
                  )}
                </div>
              </button>
            </div>

            {/* Time Display */}
            <div className="flex w-[400px] items-center justify-between text-sm text-black/70">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Elastic Slider for song progress */}
            <div className="w-[400px]">
              <ElasticSlider
                leftIcon={
                  <button onClick={handlePlay} className="text-black/70 hover:text-black">
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
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
          </div>

          {/* Right: Stats Panel */}
          <div className="flex flex-col items-center gap-8 rounded-2xl bg-black/10 px-12 py-10 backdrop-blur-sm">
            {/* Seconds Listened */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-lg font-medium tracking-wide text-black/70">
                Seconds Listened
              </p>
              <Counter
                value={secondsListened}
                fontSize={56}
                padding={5}
                gap={8}
                textColor="black"
                fontWeight={900}
                gradientFrom="transparent"
                gradientTo="transparent"
              />
            </div>

            {/* Total */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-lg font-medium tracking-wide text-black/70">
                Total
              </p>
              <div className="flex items-center gap-2">
                <Counter
                  value={parseFloat(total.toFixed(4))}
                  fontSize={56}
                  padding={5}
                  gap={8}
                  textColor="black"
                  fontWeight={900}
                  gradientFrom="transparent"
                  gradientTo="transparent"
                />
                <span className="text-lg font-medium text-black/60">
                  USDC
                </span>
              </div>
            </div>

            {/* Finish and Pay Button */}
            <Button
              onClick={handleFinishAndPay}
              disabled={isPaying}
              className="mt-4 w-full bg-black px-12 py-6 font-[family-name:var(--font-climate)] text-xl text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-black hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
            >
              {isPaying ? "Paying..." : "Finish and Pay"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
