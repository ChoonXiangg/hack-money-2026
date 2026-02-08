"use client";

import { HeroUIProvider } from "@heroui/react";
import { TransactionProvider } from "@/context/TransactionContext";
import TransactionToast from "@/components/TransactionToast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider>
      <TransactionProvider>
        {children}
        <TransactionToast />
      </TransactionProvider>
    </HeroUIProvider>
  );
}
