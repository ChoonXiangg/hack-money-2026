import { NextRequest, NextResponse } from "next/server";
import { gatewayTransfer, DOMAIN_IDS } from "@/lib/gateway";
import type { Address } from "viem";

/**
 * POST: Transfer USDC cross-chain via Gateway
 * Body: { sourceChain, destinationChain, amount, recipientAddress }
 */
export async function POST(request: NextRequest) {
  try {
    const { sourceChain, destinationChain, amount, recipientAddress } =
      await request.json();

    if (!sourceChain || !destinationChain || !amount || !recipientAddress) {
      return NextResponse.json(
        { error: "Missing required fields: sourceChain, destinationChain, amount, recipientAddress" },
        { status: 400 }
      );
    }

    if (DOMAIN_IDS[sourceChain] === undefined) {
      return NextResponse.json(
        { error: `Unsupported source chain: ${sourceChain}` },
        { status: 400 }
      );
    }

    if (DOMAIN_IDS[destinationChain] === undefined) {
      return NextResponse.json(
        { error: `Unsupported destination chain: ${destinationChain}` },
        { status: 400 }
      );
    }

    if (sourceChain === destinationChain) {
      return NextResponse.json(
        { error: "Source and destination chains must be different" },
        { status: 400 }
      );
    }

    console.log(
      `Gateway transfer: ${amount} USDC from ${sourceChain} to ${destinationChain} → ${recipientAddress}`
    );

    const result = await gatewayTransfer(
      sourceChain,
      destinationChain,
      amount,
      recipientAddress as Address
    );

    console.log(`Gateway transfer complete: mint tx=${result.mintTxHash}`);

    return NextResponse.json({
      success: true,
      sourceChain,
      destinationChain,
      amount,
      recipientAddress,
      mintTxHash: result.mintTxHash,
      attestation: result.attestation,
    });
  } catch (error) {
    console.error("Gateway transfer error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gateway transfer failed" },
      { status: 500 }
    );
  }
}
