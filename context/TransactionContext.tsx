"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface TransactionNotification {
    id: string;
    amount: string;
    songName: string;
    artistNames: string;
    timestamp: number;
}

export interface SongSpending {
    songName: string;
    totalSpent: number;
}

export interface ArtistSpending {
    artistName: string;
    totalSpent: number;
}

interface TransactionContextType {
    notifications: TransactionNotification[];
    songSpending: SongSpending[];
    artistSpending: ArtistSpending[];
    addTransaction: (data: Omit<TransactionNotification, "id" | "timestamp">) => void;
    removeTransaction: (id: string) => void;
}

const TransactionContext = createContext<TransactionContextType | null>(null);

export function useTransactions() {
    const context = useContext(TransactionContext);
    if (!context) {
        throw new Error("useTransactions must be used within TransactionProvider");
    }
    return context;
}

const AUTO_DISMISS_MS = 5000;

export function TransactionProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<TransactionNotification[]>([]);
    const [songSpending, setSongSpending] = useState<SongSpending[]>([]);
    const [artistSpending, setArtistSpending] = useState<ArtistSpending[]>([]);

    const removeTransaction = useCallback((id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, []);

    const addTransaction = useCallback(
        (data: Omit<TransactionNotification, "id" | "timestamp">) => {
            const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const notification: TransactionNotification = {
                ...data,
                id,
                timestamp: Date.now(),
            };

            setNotifications((prev) => [...prev, notification]);

            // Accumulate song spending
            const amount = parseFloat(data.amount) || 0;
            if (amount > 0) {
                setSongSpending((prev) => {
                    const existing = prev.find((s) => s.songName === data.songName);
                    if (existing) {
                        return prev.map((s) =>
                            s.songName === data.songName
                                ? { ...s, totalSpent: s.totalSpent + amount }
                                : s
                        );
                    }
                    return [...prev, { songName: data.songName, totalSpent: amount }];
                });

                // Accumulate artist spending (split evenly among artists in this transaction)
                const artists = data.artistNames
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean);
                if (artists.length > 0) {
                    const perArtist = amount / artists.length;
                    setArtistSpending((prev) => {
                        const updated = [...prev];
                        for (const artist of artists) {
                            const idx = updated.findIndex((a) => a.artistName === artist);
                            if (idx >= 0) {
                                updated[idx] = {
                                    ...updated[idx],
                                    totalSpent: updated[idx].totalSpent + perArtist,
                                };
                            } else {
                                updated.push({ artistName: artist, totalSpent: perArtist });
                            }
                        }
                        return updated;
                    });
                }
            }

            // Auto-dismiss after timeout
            setTimeout(() => {
                removeTransaction(id);
            }, AUTO_DISMISS_MS);
        },
        [removeTransaction]
    );

    return (
        <TransactionContext.Provider value={{ notifications, songSpending, artistSpending, addTransaction, removeTransaction }}>
            {children}
        </TransactionContext.Provider>
    );
}
