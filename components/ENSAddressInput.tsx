"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { useENSAddress, useENSAvatar, usePayoutChainPreference, isENSName, isValidAddress } from "@/lib/ens";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ENSAddressInputProps {
    value: string;
    onChange: (value: string) => void;
    onPayoutChainResolved?: (chain: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * An address input that supports both 0x addresses and ENS names.
 * Shows real-time resolution status and avatar when an ENS name is entered.
 */
export default function ENSAddressInput({
    value,
    onChange,
    onPayoutChainResolved,
    placeholder = "0x... or name.eth",
    className = "",
}: ENSAddressInputProps) {
    const { address: resolvedAddress, isLoading, error } = useENSAddress(value);
    const { avatar } = useENSAvatar(isENSName(value) ? value : undefined);
    const { text: payoutChain } = usePayoutChainPreference(isENSName(value) ? value : undefined);

    const showENSStatus = value && isENSName(value);
    const isValid = isValidAddress(value) || (isENSName(value) && resolvedAddress);

    const callbackRef = useRef(onPayoutChainResolved);
    callbackRef.current = onPayoutChainResolved;

    useEffect(() => {
        if (payoutChain && callbackRef.current) {
            callbackRef.current(payoutChain);
        }
    }, [payoutChain]);

    return (
        <div className="space-y-1">
            <div className="relative">
                {/* Avatar preview */}
                {avatar && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2">
                        <img
                            src={avatar}
                            alt="ENS Avatar"
                            className="h-6 w-6 rounded-full object-cover"
                        />
                    </div>
                )}

                <Input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`${className} ${avatar ? "pl-10" : ""} pr-8`}
                />

                {/* Status indicator */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {isLoading && (
                        <Loader2 className="h-4 w-4 animate-spin text-black/50" />
                    )}
                    {!isLoading && showENSStatus && resolvedAddress && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {!isLoading && showENSStatus && error && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                </div>
            </div>

            {/* Resolution feedback */}
            {showENSStatus && !isLoading && (
                <div className="text-xs">
                    {resolvedAddress ? (
                        <span className="text-green-700">
                            → {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
                        </span>
                    ) : error ? (
                        <span className="text-red-600">{error}</span>
                    ) : null}
                </div>
            )}
        </div>
    );
}

/**
 * Get the resolved address from an ENS name or address input
 * For use in form submission
 */
export function getResolvedAddress(value: string): string | null {
    if (isValidAddress(value)) {
        return value.toLowerCase();
    }
    // For ENS names, the resolution happens async via useENSAddress hook
    // This is just a sync check
    return null;
}
