"use client";

import { useTransactions, TransactionNotification } from "@/context/TransactionContext";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

function Toast({ notification, onDismiss }: { notification: TransactionNotification; onDismiss: () => void }) {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        // Trigger entrance animation
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setIsLeaving(true);
        setTimeout(onDismiss, 300);
    };

    return (
        <div
            className={`
                flex items-center gap-3 rounded-xl px-4 py-3
                bg-black/80 backdrop-blur-md border border-white/10
                shadow-2xl shadow-purple-500/20
                transition-all duration-300 ease-out
                ${isVisible && !isLeaving ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
            `}
        >
            {/* Pulsing indicator */}
            <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </div>

            {/* Content */}
            <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">
                    {notification.amount} USDC
                </span>
                <span className="text-xs text-white/70">
                    spent on <span className="text-purple-300">{notification.songName}</span>
                    {notification.artistNames && (
                        <> - <span className="text-white/50">{notification.artistNames}</span></>
                    )}
                </span>
            </div>

            {/* Dismiss button */}
            <button
                onClick={handleDismiss}
                className="ml-2 rounded-full p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}

export default function TransactionToast() {
    const { notifications, removeTransaction } = useTransactions();

    if (notifications.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
            {notifications.map((notification) => (
                <Toast
                    key={notification.id}
                    notification={notification}
                    onDismiss={() => removeTransaction(notification.id)}
                />
            ))}
        </div>
    );
}
