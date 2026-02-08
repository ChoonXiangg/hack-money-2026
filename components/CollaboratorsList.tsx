"use client";

import { useENSName, useENSAvatar, isValidAddress } from "@/lib/ens";
import { User } from "lucide-react";

interface Collaborator {
    artistName: string;
    address: string;
    ensName?: string;
    blockchain: string;
    percentage?: number;
}

interface CollaboratorItemProps {
    collaborator: Collaborator;
}

/**
 * Single collaborator item with ENS resolution
 */
function CollaboratorItem({ collaborator }: CollaboratorItemProps) {
    // Try to get ENS name from stored ensName or reverse resolve the address
    const { name: resolvedName, isLoading: nameLoading } = useENSName(
        !collaborator.ensName && isValidAddress(collaborator.address)
            ? collaborator.address
            : undefined
    );

    // Get avatar - prioritize stored ensName, then resolved name
    const ensNameToUse = collaborator.ensName || resolvedName;
    const { avatar, isLoading: avatarLoading } = useENSAvatar(ensNameToUse || undefined);

    const displayName =
        collaborator.artistName ||
        collaborator.ensName ||
        resolvedName ||
        `${collaborator.address.slice(0, 6)}...${collaborator.address.slice(-4)}`;

    const showAddress = collaborator.ensName || resolvedName;

    return (
        <div className="flex items-center gap-3 rounded-lg bg-black/10 px-3 py-2 backdrop-blur-sm">
            {/* Avatar */}
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-black/20">
                {avatar ? (
                    <img
                        src={avatar}
                        alt={displayName}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <User className="h-4 w-4 text-black/50" />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-black">
                        {displayName}
                    </span>
                    {collaborator.percentage && (
                        <span className="text-xs text-black/60">
                            {collaborator.percentage}%
                        </span>
                    )}
                </div>
                {showAddress && (
                    <div className="text-xs text-black/50 font-mono truncate">
                        {collaborator.address.slice(0, 8)}...{collaborator.address.slice(-6)}
                    </div>
                )}
            </div>
        </div>
    );
}

interface CollaboratorsListProps {
    collaborators: Collaborator[];
    className?: string;
}

/**
 * Display a list of collaborators with ENS names and avatars
 */
export default function CollaboratorsList({
    collaborators,
    className = "",
}: CollaboratorsListProps) {
    if (!collaborators || collaborators.length === 0) {
        return null;
    }

    return (
        <div className={`space-y-2 ${className}`}>
            <h3 className="text-sm font-medium text-black/70">Collaborators</h3>
            <div className="flex flex-wrap gap-2">
                {collaborators.map((collaborator, index) => (
                    <CollaboratorItem key={collaborator.address || index} collaborator={collaborator} />
                ))}
            </div>
        </div>
    );
}
