"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface TransactionNotification {
    id: string;
    amount: string;
    songName: string;
    artistNames: string;
    timestamp: number;
}

interface TransactionContextType {
    notifications: TransactionNotification[];
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

            // Auto-dismiss after timeout
            setTimeout(() => {
                removeTransaction(id);
            }, AUTO_DISMISS_MS);
        },
        [removeTransaction]
    );

    return (
        <TransactionContext.Provider value={{ notifications, addTransaction, removeTransaction }}>
            {children}
        </TransactionContext.Provider>
    );
}
