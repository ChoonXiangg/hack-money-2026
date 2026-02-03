import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const GATEWAY_API = "https://gateway-api-testnet.circle.com/v1";

const API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

if (!API_KEY || !ENTITY_SECRET) {
  console.error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in .env");
  process.exit(1);
}

const CHAINS = {
  ethereum: { domain: 0, name: "Ethereum Sepolia" },
  avalanche: { domain: 1, name: "Avalanche Fuji" },
  base: { domain: 6, name: "Base Sepolia" },
  arc: { domain: 26, name: "Arc Testnet" },
};
const chainList = Object.values(CHAINS);
const domainNames = Object.fromEntries(
  chainList.map((chain) => [chain.domain, chain.name]),
);

const toBigInt = (value: string | number | null | undefined): bigint => {
  const balanceString = String(value ?? "0");
  if (balanceString.includes(".")) {
    const [whole, decimal = ""] = balanceString.split(".");
    const decimal6 = (decimal + "000000").slice(0, 6);
    return BigInt((whole || "0") + decimal6);
  }
  return BigInt(balanceString || "0");
};

async function showUnifiedAvailableBalance(client: any, walletId: string) {
  const { data } = await client.getWallet({ id: walletId });
  const depositor = data?.wallet?.address;
  if (!depositor) throw new Error("Could not resolve wallet address");
  console.log(`Depositor address: ${depositor}`);

  // Query Gateway for the available balance recorded by the system
  const response = await fetch(`${GATEWAY_API}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "USDC",
      sources: chainList.map(({ domain }) => ({ domain, depositor })),
    }),
  });
  const { balances = [] } = await response.json();

  let totalBalances = 0n;
  for (const balance of balances) {
    const amount = toBigInt(balance?.balance);
    const chain =
      domainNames[balance!.domain as number] ??
      `Domain ${balance!.domain as number}`;
    console.log(
      `  - ${chain}: ${amount / 1_000_000n}.${(amount % 1_000_000n)
        .toString()
        .padStart(6, "0")} USDC`,
    );
    totalBalances += amount;
  }
  const whole = totalBalances / 1_000_000n;
  const decimal = totalBalances % 1_000_000n;
  const totalUsdc = `${whole}.${decimal.toString().padStart(6, "0")}`;
  console.log(`Unified USDC available: ${totalUsdc} USDC`);
}

async function main() {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: API_KEY!,
    entitySecret: ENTITY_SECRET!,
  });
  const walletId = process.env.ETH_SEPOLIA_WALLET_ID!;
  await showUnifiedAvailableBalance(client, walletId);
}

main().catch((error) => {
  console.error("\n Error:", error?.response?.data ?? error);
  process.exit(1);
});