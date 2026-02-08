"use client";

import { HeroUIProvider } from "@heroui/react";
import { TransactionProvider } from "@/context/TransactionContext";
import TransactionToast from "@/components/TransactionToast";
import Squares from "@/components/Squares";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider>
      <TransactionProvider>
        <div className="fixed inset-0 z-0">
          <Squares
            speed={0.29}
            squareSize={36}
            direction="left"
            borderColor="#865d8e"
            hoverFillColor="#b08787"
          />
        </div>
        {children}
        <TransactionToast />
      </TransactionProvider>
    </HeroUIProvider>
  );
}
