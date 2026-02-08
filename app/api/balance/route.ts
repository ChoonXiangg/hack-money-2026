import { NextRequest, NextResponse } from "next/server";
import {
  getChainBalance,
  getUnifiedGatewayBalance,
  formatUSDC,
  USDC_ADDRESSES,
} from "@/lib/gateway";
import type { Address } from "viem";

// All supported chains with their USDC addresses
const CHAINS = Object.entries(USDC_ADDRESSES).map(([name, usdc]) => ({
  name: name.replace(/_/g, " "),
  id: name,
  usdc,
}));

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const addr = address as Address;

    // Fetch on-chain balances for all chains + Gateway unified balance in parallel
    const [gatewayResult, ...chainResults] = await Promise.allSettled([
      getUnifiedGatewayBalance(addr),
      ...CHAINS.map(async (chain) => {
        const raw = await getChainBalance(chain.id, addr);
        return { name: chain.name, id: chain.id, raw };
      }),
    ]);

    // Process per-chain on-chain balances
    let totalRaw = BigInt(0);
    const chainBalances: { chain: string; chainId: string; balance: string }[] = [];

    for (const result of chainResults) {
      if (result.status === "fulfilled") {
        const { name, id, raw } = result.value as { name: string; id: string; raw: bigint };
        chainBalances.push({
          chain: name,
          chainId: id,
          balance: formatUSDC(raw),
        });
        totalRaw += raw;
      }
    }

    // Process Gateway balance
    const gateway =
      gatewayResult.status === "fulfilled"
        ? gatewayResult.value
        : { perChain: {}, totalAvailable: "0.000000" };

    return NextResponse.json({
      total: formatUSDC(totalRaw),
      chainBalances,
      gateway: {
        perChain: gateway.perChain,
        totalAvailable: gateway.totalAvailable,
      },
    });
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
