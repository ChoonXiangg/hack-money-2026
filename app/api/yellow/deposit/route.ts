import { NextRequest, NextResponse } from "next/server";

const YELLOW_BACKEND_URL = process.env.YELLOW_BACKEND_URL || "http://localhost:3001";

/**
 * POST /api/yellow/deposit
 * Deposit funds and start Yellow Network app session
 *
 * This endpoint:
 * 1. Takes user address, private key, and deposit amount
 * 2. Calls Yellow backend to start session with deposit
 * 3. Session creates app session between user and relayer
 * 4. Includes on-chain deposit to custody contract
 *
 * ⚠️ WARNING: Sending private keys over HTTP is for TESTNET ONLY!
 * In production, use MetaMask/WalletConnect for signing.
 *
 * Body: { userAddress: string, privateKey: string, depositAmount: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress, privateKey, depositAmount } = await request.json();

    if (!userAddress || !privateKey || !depositAmount) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress, privateKey, depositAmount" },
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

    // Validate private key format
    if (!privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
      return NextResponse.json(
        { error: "Invalid private key format" },
        { status: 400 }
      );
    }

    // Validate amount
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid deposit amount" },
        { status: 400 }
      );
    }

    console.log(`[Deposit] Starting session for ${userAddress} with ${depositAmount} USDC`);

    // Call Yellow backend to start session with deposit
    const backendRes = await fetch(`${YELLOW_BACKEND_URL}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAddress,
        privateKey,
        depositAmount,
      }),
    });

    if (!backendRes.ok) {
      const errorData = await backendRes.json();
      console.error("[Deposit] Backend error:", errorData);
      return NextResponse.json(
        {
          error: errorData.error || "Failed to start session",
          message: errorData.message,
        },
        { status: 500 }
      );
    }

    const sessionData = await backendRes.json();

    console.log(`[Deposit] Session started:`, sessionData);

    return NextResponse.json({
      success: true,
      message: `Successfully deposited ${depositAmount} USDC and started session`,
      session: {
        id: sessionData.sessionId,
        channelId: sessionData.channelId,
        depositAmount: sessionData.depositAmount,
        currentBalance: sessionData.currentBalance,
      },
    });
  } catch (error) {
    console.error("[Deposit] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process deposit",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
