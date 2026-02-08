import { NextRequest, NextResponse } from "next/server";
import {
  depositToGateway,
  getSupportedChains,
  USDC_ADDRESSES,
  GATEWAY_WALLET,
} from "@/lib/gateway";

/**
 * GET: Return deposit instructions for a given source chain
 * Query params: ?chain=Ethereum_Sepolia
 */
export async function GET(request: NextRequest) {
  const chain = request.nextUrl.searchParams.get("chain");

  if (!chain || !USDC_ADDRESSES[chain]) {
    return NextResponse.json({
      error: "Invalid or missing chain parameter",
      supportedChains: getSupportedChains(),
    }, { status: 400 });
  }

  return NextResponse.json({
    chain,
    gatewayWallet: GATEWAY_WALLET,
    usdcContract: USDC_ADDRESSES[chain],
    instructions: `Approve USDC on ${chain} for Gateway Wallet, then call deposit(token, amount)`,
    supportedChains: getSupportedChains(),
  });
}

/**
 * POST: Execute a server-side deposit into Gateway
 * Body: { sourceChain: string, amount: string }
 *
 * This uses the server's EVM_PRIVATE_KEY to approve + deposit.
 * In production, the frontend would handle signing via MetaMask.
 */
export async function POST(request: NextRequest) {
  try {
    const { sourceChain, amount } = await request.json();

    if (!sourceChain || !amount) {
      return NextResponse.json(
        { error: "Missing sourceChain or amount" },
        { status: 400 }
      );
    }

    if (!USDC_ADDRESSES[sourceChain]) {
      return NextResponse.json(
        { error: `Unsupported chain: ${sourceChain}`, supportedChains: getSupportedChains() },
        { status: 400 }
      );
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    console.log(`Gateway deposit: ${amount} USDC on ${sourceChain}`);

    const result = await depositToGateway(sourceChain, amount);

    console.log(`Gateway deposit complete: approval=${result.approvalTxHash}, deposit=${result.depositTxHash}`);

    return NextResponse.json({
      success: true,
      sourceChain,
      amount,
      approvalTxHash: result.approvalTxHash,
      depositTxHash: result.depositTxHash,
    });
  } catch (error) {
    console.error("Gateway deposit error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gateway deposit failed" },
      { status: 500 }
    );
  }
}
