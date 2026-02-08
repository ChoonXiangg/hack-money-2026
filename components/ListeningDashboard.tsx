"use client";

import { useTransactions } from "@/context/TransactionContext";
import { Music, User } from "lucide-react";

export default function ListeningDashboard() {
    const { songSpending, artistSpending } = useTransactions();

    if (songSpending.length === 0 && artistSpending.length === 0) {
        return null;
    }

    return (
        <div className="mt-3 rounded-xl bg-black/90 border border-white/10 px-4 py-3">
            <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3 font-[family-name:var(--font-climate)]">
                Listening Activity
            </h3>

            {/* Songs Section */}
            {songSpending.length > 0 && (
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Music className="h-3 w-3 text-purple-400" />
                        <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">
                            Songs
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {songSpending.map((song) => (
                            <div
                                key={song.songName}
                                className="flex items-center justify-between text-xs"
                            >
                                <span className="text-white/70 truncate mr-2 font-[family-name:var(--font-murecho)]">
                                    {song.songName}
                                </span>
                                <span className="text-white/90 font-mono text-[10px] whitespace-nowrap">
                                    {song.totalSpent.toFixed(6)} USDC
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Divider */}
            {songSpending.length > 0 && artistSpending.length > 0 && (
                <hr className="my-3 border-white/10" />
            )}

            {/* Artists Section */}
            {artistSpending.length > 0 && (
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <User className="h-3 w-3 text-green-400" />
                        <span className="text-[10px] font-semibold text-green-400 uppercase tracking-wider">
                            Artists
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {artistSpending.map((artist) => (
                            <div
                                key={artist.artistName}
                                className="flex items-center justify-between text-xs"
                            >
                                <span className="text-white/70 truncate mr-2 font-[family-name:var(--font-murecho)]">
                                    {artist.artistName}
                                </span>
                                <span className="text-white/90 font-mono text-[10px] whitespace-nowrap">
                                    {artist.totalSpent.toFixed(6)} USDC
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
