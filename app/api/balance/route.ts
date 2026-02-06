import { NextRequest, NextResponse } from "next/server";

// balanceOf(address) function selector
const BALANCE_OF_SELECTOR = "0x70a08231";

const CHAINS = [
  {
    name: "Ethereum Sepolia",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  {
    name: "Avalanche Fuji",
    rpc: "https://api.avax-test.network/ext/bc/C/rpc",
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
  {
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    name: "Arc Testnet",
    rpc: "https://rpc.testnet.arc.network",
    usdc: "0x3600000000000000000000000000000000000000",
  },
];

async function getBalanceOf(
  rpc: string,
  usdcAddress: string,
  walletAddress: string
): Promise<bigint> {
  const paddedAddress = walletAddress.replace("0x", "").padStart(64, "0");
  const data = `${BALANCE_OF_SELECTOR}${paddedAddress}`;

  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: usdcAddress, data }, "latest"],
      id: 1,
    }),
  });

  const result = await response.json();
  if (result.result) {
    return BigInt(result.result);
  }
  return 0n;
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const results = await Promise.allSettled(
      CHAINS.map(async (chain) => {
        const raw = await getBalanceOf(chain.rpc, chain.usdc, address);
        return { name: chain.name, raw };
      })
    );

    let totalRaw = 0n;
    const chainBalances: { chain: string; balance: string }[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { name, raw } = result.value;
        const whole = raw / 1_000_000n;
        const decimal = raw % 1_000_000n;
        chainBalances.push({
          chain: name,
          balance: `${whole}.${decimal.toString().padStart(6, "0")}`,
        });
        totalRaw += raw;
      }
    }

    const totalWhole = totalRaw / 1_000_000n;
    const totalDecimal = totalRaw % 1_000_000n;
    const total = `${totalWhole}.${totalDecimal.toString().padStart(6, "0")}`;

    return NextResponse.json({ total, chainBalances });
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
