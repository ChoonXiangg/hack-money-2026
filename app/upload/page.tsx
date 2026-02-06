"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Upload, Plus, X, Music, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Grainient from "@/components/ui/Grainient";

// Arc supported testnets from arc/src/chains.js
const SUPPORTED_TESTNETS = [
  { id: "Arc_Testnet", name: "Arc" },
  { id: "Ethereum_Sepolia", name: "Ethereum Sepolia" },
  { id: "Arbitrum_Sepolia", name: "Arbitrum Sepolia" },
  { id: "Avalanche_Fuji", name: "Avalanche Fuji" },
  { id: "Base_Sepolia", name: "Base Sepolia" },
  { id: "Optimism_Sepolia", name: "Optimism Sepolia" },
  { id: "Polygon_Amoy", name: "Polygon Amoy" },
  { id: "Unichain_Sepolia", name: "Unichain Sepolia" },
  { id: "Solana_Devnet", name: "Solana Devnet" },
];

interface Collaborator {
  id: string;
  artistName: string;
  address: string;
  blockchain: string;
  percentage: number;
}

export default function UploadPage() {
  const [songFile, setSongFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [songName, setSongName] = useState("");
  const [pricePerSecond, setPricePerSecond] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([
    { id: "1", artistName: "", address: "", blockchain: "Arc_Testnet", percentage: 100 },
  ]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("audio/")) {
        setSongFile(file);
      }
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setSongFile(files[0]);
      }
    },
    []
  );

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Image upload handlers
  const handleImageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsImageDragging(true);
  }, []);

  const handleImageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsImageDragging(false);
  }, []);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsImageDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  }, []);

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    },
    []
  );

  const handleImageUploadClick = () => {
    imageInputRef.current?.click();
  };

  const totalPercentage = collaborators.reduce((sum, c) => sum + c.percentage, 0);

  const addCollaborator = () => {
    setCollaborators([
      ...collaborators,
      {
        id: Date.now().toString(),
        artistName: "",
        address: "",
        blockchain: "Arc_Testnet",
        percentage: 0,
      },
    ]);
  };

  const removeCollaborator = (id: string) => {
    if (collaborators.length > 1) {
      setCollaborators(collaborators.filter((c) => c.id !== id));
    }
  };

  const updateCollaborator = (
    id: string,
    field: keyof Omit<Collaborator, "id">,
    value: string | number
  ) => {
    setCollaborators(
      collaborators.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!songFile || !songName || !pricePerSecond) {
      alert("Please fill in all required fields");
      return;
    }

    if (totalPercentage !== 100) {
      alert(`Collaborator percentages must add up to 100%. Currently: ${totalPercentage}%`);
      return;
    }

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      const formData = new FormData();
      formData.append("songFile", songFile);
      if (imageFile) {
        formData.append("imageFile", imageFile);
      }
      formData.append("songName", songName);
      formData.append("pricePerSecond", pricePerSecond);
      formData.append("collaborators", JSON.stringify(
        collaborators.map(({ artistName, address, blockchain, percentage }) => ({
          artistName,
          address,
          blockchain,
          percentage,
        }))
      ));

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const result = await response.json();
      console.log("Upload successful:", result);
      setUploadStatus("success");

      // Reset form
      setSongFile(null);
      setImageFile(null);
      setImagePreview(null);
      setSongName("");
      setPricePerSecond("");
      setCollaborators([{ id: "1", artistName: "", address: "", blockchain: "Arc_Testnet", percentage: 100 }]);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="relative min-h-screen">
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

      {/* Header */}
      <div className="relative z-10 px-8 pt-6">
        <Link href="/" className="font-[family-name:var(--font-climate)] text-2xl text-black transition-opacity hover:opacity-70">
          LeStream
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-8 text-center text-5xl text-black font-[family-name:var(--font-climate)]">
          Upload Song
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Area */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-black">Upload Song</Label>
            <div
              onClick={handleUploadClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 backdrop-blur-sm transition-all ${
                isDragging
                  ? "border-black bg-black/15"
                  : "border-black/50 bg-black/5 hover:border-black hover:bg-black/10"
              }`}
            >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {songFile ? (
              <div className="flex flex-col items-center gap-3">
                <Music className="h-12 w-12 text-black" />
                <p className="text-lg font-medium text-black">{songFile.name}</p>
                <p className="text-sm text-black/70">
                  {(songFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <>
                <Upload className="mb-4 h-12 w-12 text-black/80" />
                <p className="text-lg font-medium text-black">
                  Click to Upload or Drag and Drop
                </p>
                <p className="mt-1 text-sm text-black/70">
                  MP3, WAV, FLAC (max 50MB)
                </p>
              </>
            )}
            </div>
          </div>

          {/* Image Upload Area */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-black">Upload Image</Label>
            <div
              onClick={handleImageUploadClick}
              onDragOver={handleImageDragOver}
              onDragLeave={handleImageDragLeave}
              onDrop={handleImageDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 backdrop-blur-sm transition-all ${
                isImageDragging
                  ? "border-black bg-black/15"
                  : "border-black/50 bg-black/5 hover:border-black hover:bg-black/10"
              }`}
            >
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            {imagePreview ? (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={imagePreview}
                  alt="Song cover preview"
                  className="h-32 w-32 rounded-lg object-cover"
                />
                <p className="text-sm font-medium text-black">{imageFile?.name}</p>
              </div>
            ) : (
              <>
                <ImageIcon className="mb-3 h-10 w-10 text-black/80" />
                <p className="text-base font-medium text-black">
                  Click to Upload or Drag and Drop
                </p>
                <p className="mt-1 text-sm text-black/70">
                  PNG, JPEG (max 50MB)
                </p>
              </>
            )}
            </div>
          </div>

          {/* Song Name */}
          <div className="space-y-2">
            <Label htmlFor="songName" className="text-sm font-medium text-black">
              Song Name
            </Label>
            <Input
              id="songName"
              type="text"
              placeholder="Enter song name"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              className="border-black/30 bg-black/5 text-black backdrop-blur-sm placeholder:text-black/50 focus:border-black focus:ring-black/30"
            />
          </div>

          {/* Price per Second */}
          <div className="space-y-2">
            <Label
              htmlFor="pricePerSecond"
              className="text-sm font-medium text-black"
            >
              Price per Second (USDC)
            </Label>
            <Input
              id="pricePerSecond"
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.0001"
              value={pricePerSecond}
              onChange={(e) => setPricePerSecond(e.target.value)}
              className="border-black/30 bg-black/5 text-black backdrop-blur-sm placeholder:text-black/50 focus:border-black focus:ring-black/30"
            />
          </div>

          {/* Collaborators Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-black">
                Collaborators
              </Label>
              <Button
                type="button"
                onClick={addCollaborator}
                variant="ghost"
                size="sm"
                className="text-black hover:bg-black/10 hover:text-black"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Collaborator
              </Button>
            </div>

            <div className="space-y-4">
              {collaborators.map((collaborator, index) => (
                <div
                  key={collaborator.id}
                  className="rounded-lg bg-black/5 p-4 backdrop-blur-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-black/80">
                      Collaborator {index + 1}
                    </span>
                    {collaborators.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => removeCollaborator(collaborator.id)}
                        variant="ghost"
                        size="icon-xs"
                        className="text-black/70 hover:bg-black/10 hover:text-black"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3">
                    {/* Artist Name */}
                    <div className="space-y-1">
                      <Label className="text-xs text-black/70">Artist Name</Label>
                      <Input
                        type="text"
                        placeholder="Enter artist name"
                        value={collaborator.artistName}
                        onChange={(e) =>
                          updateCollaborator(
                            collaborator.id,
                            "artistName",
                            e.target.value
                          )
                        }
                        className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus:border-black/50"
                      />
                    </div>

                    {/* Address */}
                    <div className="space-y-1">
                      <Label className="text-xs text-black/70">Address</Label>
                      <Input
                        type="text"
                        placeholder="0x..."
                        value={collaborator.address}
                        onChange={(e) =>
                          updateCollaborator(
                            collaborator.id,
                            "address",
                            e.target.value
                          )
                        }
                        className="border-black/20 bg-black/5 font-mono text-black placeholder:text-black/40 focus:border-black/50"
                      />
                    </div>

                    {/* Percentage and Blockchain row */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Percentage */}
                      <div className="space-y-1">
                        <Label className="text-xs text-black/70">Percentage (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="50"
                          value={collaborator.percentage || ""}
                          onChange={(e) =>
                            updateCollaborator(
                              collaborator.id,
                              "percentage",
                              Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                            )
                          }
                          className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus:border-black/50"
                        />
                      </div>

                      {/* Blockchain */}
                      <div className="space-y-1">
                        <Label className="text-xs text-black/70">Blockchain</Label>
                        <Select
                          value={collaborator.blockchain}
                          onValueChange={(value) =>
                            updateCollaborator(collaborator.id, "blockchain", value)
                          }
                        >
                          <SelectTrigger className="w-full border-black/20 bg-black/5 text-black focus:border-black/50 [&>svg]:text-black/70">
                            <SelectValue placeholder="Select blockchain" />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_TESTNETS.map((chain) => (
                              <SelectItem key={chain.id} value={chain.id}>
                                {chain.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Percentage */}
            <div className={`text-right text-sm font-medium ${totalPercentage === 100 ? "text-black/70" : "text-red-600"}`}>
              Total: {totalPercentage}% {totalPercentage !== 100 && "(must be 100%)"}
            </div>
          </div>

          {/* Status Messages */}
          {uploadStatus === "success" && (
            <div className="rounded-lg bg-green-500/20 p-4 text-center text-green-800">
              Song uploaded successfully!
            </div>
          )}
          {uploadStatus === "error" && (
            <div className="rounded-lg bg-red-500/20 p-4 text-center text-red-800">
              Failed to upload song. Please try again.
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isUploading}
            className="w-full bg-black py-6 text-xl text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-black hover:shadow-xl font-[family-name:var(--font-climate)] disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload Song"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
