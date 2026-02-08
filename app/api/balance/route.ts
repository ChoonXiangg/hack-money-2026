import { NextRequest, NextResponse } from "next/server";
import {
  getChainBalance,
  getUnifiedGatewayBalance,
  formatUSDC,
  USDC_ADDRESSES,
} from "@/lib/gateway";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";

// ytest.usd token address on Sepolia (Yellow Network sandbox token)
const YTEST_USD_ADDRESS = "0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb" as Address;
const SEPOLIA_RPC_URL = process.env.ALCHEMY_RPC_URL || "https://1rpc.io/sepolia";

// ERC20 balanceOf ABI
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

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

    // Create Sepolia client for ytest.usd balance
    const sepoliaClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    });

    // Fetch ytest.usd wallet balance, gateway balance, and chain balances in parallel
    const [ytestResult, gatewayResult, ...chainResults] = await Promise.allSettled([
      sepoliaClient.readContract({
        address: YTEST_USD_ADDRESS,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [addr],
      }),
      getUnifiedGatewayBalance(addr),
      ...CHAINS.map(async (chain) => {
        const raw = await getChainBalance(chain.id, addr);
        return { name: chain.name, id: chain.id, raw };
      }),
    ]);

    // Process ytest.usd wallet balance
    let ytestBalance = "0.000000";
    if (ytestResult.status === "fulfilled") {
      const raw = ytestResult.value as bigint;
      const million = BigInt(1000000);
      const whole = raw / million;
      const decimal = raw % million;
      ytestBalance = `${whole}.${decimal.toString().padStart(6, "0")}`;
    }

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
      ytestBalance, // ytest.usd wallet balance on Sepolia
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
