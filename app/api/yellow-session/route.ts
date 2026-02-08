import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";

// Yellow Network Sepolia configuration
const CUSTODY_ADDRESS = "0x019B65A265EB3363822f2752141b3dF16131b262" as Address;
const TOKEN_ADDRESS = "0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb" as Address; // ytest.usd
const RPC_URL = process.env.ALCHEMY_RPC_URL || "https://1rpc.io/sepolia";
const YELLOW_BACKEND_URL = process.env.YELLOW_BACKEND_URL || "http://localhost:3001";

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
 * Get user's Yellow Network session balance
 *
 * This endpoint returns:
 * 1. Active session balance (if user has an active app session via backend server)
 * 2. Custody balance (as fallback if no active session)
 *
 * GET /api/yellow-session?address=0x...
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

    // Try to get session balance from Yellow backend server
    let sessionBalance: string | null = null;
    let hasActiveSession = false;

    try {
      const backendRes = await fetch(`${YELLOW_BACKEND_URL}/session/balance?address=${address}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (backendRes.ok) {
        const backendData = await backendRes.json();
        if (backendData.hasActiveSession && backendData.formatted) {
          sessionBalance = backendData.formatted;
          hasActiveSession = true;
        }
      }
    } catch (backendError) {
      // Backend not available or no active session - fall back to custody balance
      console.log('Yellow backend not available, falling back to custody balance');
    }

    // If session balance is available, return it
    if (sessionBalance && hasActiveSession) {
      return NextResponse.json({
        address,
        balance: sessionBalance,
        formatted: sessionBalance,
        decimals: 6,
        token: "ytest.usd",
        hasActiveSession: true,
        source: "session", // Balance from active app session
      });
    }

    // Otherwise, fall back to custody balance
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL),
    });

    const balances = await publicClient.readContract({
      address: CUSTODY_ADDRESS,
      abi: CUSTODY_ABI,
      functionName: "getAccountsBalances",
      args: [[address as Address], [TOKEN_ADDRESS]],
    });

    const custodyBalance = balances[0] || BigInt(0);

    // Format balance (6 decimals for USDC)
    const million = BigInt(1000000);
    const whole = custodyBalance / million;
    const decimal = custodyBalance % million;
    const formatted = `${whole}.${decimal.toString().padStart(6, "0")}`;

    return NextResponse.json({
      address,
      balance: custodyBalance.toString(),
      formatted,
      decimals: 6,
      token: "ytest.usd",
      hasActiveSession: false,
      source: "custody", // Balance from custody contract
    });
  } catch (error) {
    console.error("Yellow session balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Yellow session balance" },
      { status: 500 }
    );
  }
}
