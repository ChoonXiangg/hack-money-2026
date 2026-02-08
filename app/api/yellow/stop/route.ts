import { NextRequest, NextResponse } from "next/server";

const YELLOW_BACKEND_URL = process.env.YELLOW_BACKEND_URL || "http://localhost:3001";

/**
 * POST /api/yellow/stop
 * Stop playing current song on the Yellow Network session
 * This triggers an off-chain microtransaction for the time listened
 * Returns transactionDetails for toast notifications
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userAddress } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "Missing userAddress" },
                { status: 400 }
            );
        }

        // Forward to Yellow backend
        const response = await fetch(`${YELLOW_BACKEND_URL}/session/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userAddress: userAddress.toLowerCase() }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Don't fail if no active session - user may be playing without session
            if (data.error === "No active session") {
                return NextResponse.json({
                    success: false,
                    message: "No active Yellow session",
                });
            }
            return NextResponse.json(
                { error: data.error || "Failed to stop play" },
                { status: response.status }
            );
        }

        // Return full response including transactionDetails
        return NextResponse.json(data);
    } catch (error) {
        console.error("Yellow stop error:", error);
        // Graceful degradation - don't block the user if Yellow backend is down
        return NextResponse.json({
            success: false,
            message: "Yellow backend unavailable",
        });
    }
}

