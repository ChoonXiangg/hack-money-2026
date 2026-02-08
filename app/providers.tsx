"use client";

import { HeroUIProvider } from "@heroui/react";
import { TransactionProvider } from "@/context/TransactionContext";
import TransactionToast from "@/components/TransactionToast";
import PixelBlast from "@/components/PixelBlast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider>
      <TransactionProvider>
        <div className="fixed inset-0 z-0">
          <PixelBlast
            variant="square"
            pixelSize={3}
            color="#B19EEF"
            patternScale={4.25}
            patternDensity={1.3}
            pixelSizeJitter={0.6}
            enableRipples
            rippleSpeed={0.4}
            rippleThickness={0.12}
            rippleIntensityScale={1.5}
            liquid={false}
            liquidStrength={0.12}
            liquidRadius={1.2}
            liquidWobbleSpeed={5}
            speed={0.5}
            edgeFade={0.25}
            transparent
          />
        </div>
        {children}
        <TransactionToast />
      </TransactionProvider>
    </HeroUIProvider>
  );
}
