import { NextRequest, NextResponse } from "next/server";

const YELLOW_BACKEND_URL = process.env.YELLOW_BACKEND_URL || "http://localhost:3001";

/**
 * POST /api/yellow/withdraw
 * End Yellow Network session and withdraw all funds from custody
 *
 * This endpoint:
 * 1. Ends the active app session (if any)
 * 2. Withdraws all funds from custody back to user's wallet
 * 3. Returns settlement information
 *
 * Body: { userAddress: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json();

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing userAddress" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    console.log(`[Withdraw] Ending session for ${userAddress}`);

    // Call Yellow backend to end session
    const backendRes = await fetch(`${YELLOW_BACKEND_URL}/session/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress }),
    });

    if (!backendRes.ok) {
      const errorData = await backendRes.json();

      // If no active session, that's okay - just return success
      if (errorData.error === "No active session") {
        return NextResponse.json({
          success: true,
          message: "No active session to end",
          amount: "0.0000",
        });
      }

      console.error("[Withdraw] Backend error:", errorData);
      return NextResponse.json(
        {
          error: errorData.error || "Failed to end session",
          message: errorData.message,
        },
        { status: 500 }
      );
    }

    const settlementData = await backendRes.json();

    console.log(`[Withdraw] Session ended:`, settlementData);

    return NextResponse.json({
      success: true,
      message: `Successfully withdrew ${settlementData.settlement?.refundAmount || '0.0000'} USDC`,
      amount: settlementData.settlement?.refundAmount || "0.0000",
      settlement: {
        totalSpent: settlementData.settlement?.totalSpent,
        refundAmount: settlementData.settlement?.refundAmount,
        listeningActivity: settlementData.settlement?.listeningActivity,
      },
    });
  } catch (error) {
    console.error("[Withdraw] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process withdrawal",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
