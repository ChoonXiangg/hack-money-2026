import { NextRequest, NextResponse } from "next/server";
import {
  getUnifiedGatewayBalance,
  getChainBalance,
  formatUSDC,
  USDC_ADDRESSES,
} from "@/lib/gateway";
import type { Address } from "viem";

/**
 * GET: Fetch USDC balances across all supported chains + Gateway unified balance
 * Query params: ?address=0x...
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const addr = address as Address;

    // Fetch on-chain USDC balances per chain and Gateway unified balance in parallel
    const [gatewayBalance, ...chainBalances] = await Promise.allSettled([
      getUnifiedGatewayBalance(addr),
      ...Object.keys(USDC_ADDRESSES).map(async (chain) => {
        const raw = await getChainBalance(chain, addr);
        return { chain, raw, formatted: formatUSDC(raw) };
      }),
    ]);

    // Process chain balances
    const onChainBalances: { chain: string; balance: string }[] = [];
    let totalOnChain = BigInt(0);

    for (const result of chainBalances) {
      if (result.status === "fulfilled") {
        const { chain, raw, formatted } = result.value as { chain: string; raw: bigint; formatted: string };
        onChainBalances.push({ chain, balance: formatted });
        totalOnChain += raw;
      }
    }

    // Process Gateway balance
    const gateway =
      gatewayBalance.status === "fulfilled"
        ? gatewayBalance.value
        : { perChain: {}, totalAvailable: "0.000000" };

    return NextResponse.json({
      address,
      onChain: {
        balances: onChainBalances,
        total: formatUSDC(totalOnChain),
      },
      gateway: {
        perChain: gateway.perChain,
        totalAvailable: gateway.totalAvailable,
      },
    });
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balances" },
      { status: 500 }
    );
  }
}
