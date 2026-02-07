"use client";

import { useState, useEffect } from "react";

export default function StreamCredits() {
    const [credits, setCredits] = useState<string | null>(null);

    useEffect(() => {
        // TODO: Fetch actual stream credits from Yellow Network custody/ledger
        // For now, display a placeholder
        setCredits("0.00");
    }, []);

    return (
        <div
            className="bg-black px-5 py-3 text-sm font-semibold text-white shadow-lg font-[family-name:var(--font-climate)]"
            style={{ borderRadius: "12px" }}
        >
            <span className="flex items-center gap-2">
                Stream Credits
                {credits !== null && (
                    <span className="font-[family-name:var(--font-murecho)] text-xs font-normal text-white/70">
                        {credits} USDC
                    </span>
                )}
            </span>
        </div>
    );
}
