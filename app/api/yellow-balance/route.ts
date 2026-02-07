import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";

// Yellow Network Sepolia configuration
const CUSTODY_ADDRESS = "0x019B65A265EB3363822f2752141b3dF16131b262" as Address;
const TOKEN_ADDRESS = "0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb" as Address; // ytest.usd
const RPC_URL = process.env.ALCHEMY_RPC_URL || "https://1rpc.io/sepolia";

// Minimal ABI for getAccountsBalances function
const CUSTODY_ABI = [
  {
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "tokens", type: "address[]" }
    ],
    name: "getAccountsBalances",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Get user's Yellow Network custody balance
 * GET /api/yellow-balance?address=0x...
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Missing address parameter" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Create public client for reading contract
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL),
    });

    // Read custody balance from Yellow Network custody contract
    const balances = await publicClient.readContract({
      address: CUSTODY_ADDRESS,
      abi: CUSTODY_ABI,
      functionName: "getAccountsBalances",
      args: [[address as Address], [TOKEN_ADDRESS]],
    });

    const custodyBalance = balances[0] || 0n;

    // Format balance (6 decimals for USDC)
    const whole = custodyBalance / 1_000_000n;
    const decimal = custodyBalance % 1_000_000n;
    const formatted = `${whole}.${decimal.toString().padStart(6, "0")}`;

    return NextResponse.json({
      address,
      custodyBalance: custodyBalance.toString(),
      formatted,
      decimals: 6,
      token: "ytest.usd",
    });
  } catch (error) {
    console.error("Yellow balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Yellow custody balance" },
      { status: 500 }
    );
  }
}
