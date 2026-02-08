import { NextRequest, NextResponse } from "next/server";

const YELLOW_BACKEND_URL = process.env.YELLOW_BACKEND_URL || "http://localhost:3001";

/**
 * POST /api/yellow/play
 * Start playing a song on the Yellow Network session
 * This triggers off-chain tracking of the song play
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userAddress, song } = body;

        if (!userAddress || !song) {
            return NextResponse.json(
                { error: "Missing userAddress or song data" },
                { status: 400 }
            );
        }

        // Forward to Yellow backend
        const response = await fetch(`${YELLOW_BACKEND_URL}/session/play`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userAddress: userAddress.toLowerCase(), song }),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(
                { error: data.error || "Failed to start play" },
                { status: response.status }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Yellow play error:", error);
        return NextResponse.json(
            { error: "Failed to connect to Yellow backend" },
            { status: 500 }
        );
    }
}
