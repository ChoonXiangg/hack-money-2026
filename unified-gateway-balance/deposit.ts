import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

/* Chain configuration */
type Chain = "ethereum" | "base" | "avalanche" | "arc";

type ChainConfig = {
  chainName: string;
  usdc: string;
  walletId: string;
};

const CHAIN_CONFIG: Record<Chain, ChainConfig> = {
  ethereum: {
    chainName: "Ethereum Sepolia",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    walletId: getRequiredWalletId("ETH_SEPOLIA_WALLET_ID"),
  },
  base: {
    chainName: "Base Sepolia",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    walletId: getRequiredWalletId("BASE_SEPOLIA_WALLET_ID"),
  },
  avalanche: {
    chainName: "Avalanche Fuji",
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    walletId: getRequiredWalletId("AVAX_FUJI_WALLET_ID"),
  },
  arc: {
    chainName: "Arc Testnet",
    usdc: "0x3600000000000000000000000000000000000000",
    walletId: getRequiredWalletId("ARC_TESTNET_WALLET_ID"),
  },
};

/* Constants */
const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

const API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

if (!API_KEY || !ENTITY_SECRET) {
  console.error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in .env");
  process.exit(1);
}

const DEPOSIT_AMOUNT_USDC = "5";

/* Helpers */
// Get required wallet ID from env
function getRequiredWalletId(envKey: string) {
  const value = process.env[envKey];
  if (!value) {
    console.error(`Missing ${envKey} in .env`);
    process.exit(1);
  }
  return value;
}

// Parse chains from CLI arguments
function parseSelectedChains() {
  const args = process.argv.slice(2).map((chain) => chain.toLowerCase());
  if (args.length === 0) return Object.keys(CHAIN_CONFIG) as Chain[];

  const selected: Chain[] = [];
  for (const arg of args) {
    if (!(arg in CHAIN_CONFIG)) {
      console.error(
        `Unsupported chain: ${arg}\n` +
          `Usage: npm run deposit -- [${Object.keys(CHAIN_CONFIG).join("] [")}]\n` +
          `Example: npm run deposit -- base avalanche`,
      );
      process.exit(1);
    }
    selected.push(arg as Chain);
  }
  return dedupe(selected);
}

// Dedupe chains from CLI arguments
function dedupe<T>(array: T[]) {
  const chains = new Set<T>();
  return array.filter((chain) =>
    chains.has(chain) ? false : (chains.add(chain), true),
  );
}

// Poll until transaction reaches terminal state
async function waitForTxCompletion(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  txId: string,
  label: string,
) {
  const terminalStates = new Set([
    "COMPLETE",
    "CONFIRMED",
    "FAILED",
    "DENIED",
    "CANCELLED",
  ]);

  process.stdout.write(`Waiting for ${label} (txId=${txId})\n`);

  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;

    process.stdout.write(".");

    if (state && terminalStates.has(state)) {
      process.stdout.write("\n");
      console.log(`${label} final state: ${state}`);

      if (state !== "COMPLETE" && state !== "CONFIRMED") {
        throw new Error(
          `${label} did not complete successfully (state=${state})`,
        );
      }
      return data.transaction;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

// Parse decimal to base units: "10.5" → 10500000n
function parseBalance(usdcStr: string) {
  const [whole, decimal = ""] = String(usdcStr).split(".");
  const decimal6 = (decimal + "000000").slice(0, 6);
  return BigInt(whole + decimal6);
}

/* Main logic */
async function main() {
  // Allows for chain selection via CLI arguments
  const selectedChains = parseSelectedChains();
  console.log(
    `Depositing to: ${selectedChains.map((chain) => CHAIN_CONFIG[chain].chainName).join(", ")}`,
  );

  // Initiate wallets client
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: API_KEY!,
    entitySecret: ENTITY_SECRET!,
  });

  // Process each selected chain
  for (const chain of selectedChains) {
    const config = CHAIN_CONFIG[chain];
    const USDC_ADDRESS = config.usdc;
    const WALLET_ID = config.walletId;

    console.log(`\n--- ${config.chainName} ---`);

    // Approve USDC for the Gateway Wallet to transfer USDC from your address
    console.log(
      `Approving ${DEPOSIT_AMOUNT_USDC} USDC for spender ${GATEWAY_WALLET_ADDRESS}`,
    );

    const approveTx = await client.createContractExecutionTransaction({
      walletId: WALLET_ID!,
      contractAddress: USDC_ADDRESS,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [
        GATEWAY_WALLET_ADDRESS,
        parseBalance(DEPOSIT_AMOUNT_USDC).toString(),
      ],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const approveTxId = approveTx.data?.id;
    if (!approveTxId) throw new Error("Failed to create approve transaction");

    await waitForTxCompletion(client, approveTxId, "USDC approve");

    // Call deposit method on the Gateway Wallet contract
    console.log(`Depositing ${DEPOSIT_AMOUNT_USDC} USDC to Gateway Wallet`);

    const depositTx = await client.createContractExecutionTransaction({
      walletId: WALLET_ID!,
      contractAddress: GATEWAY_WALLET_ADDRESS,
      abiFunctionSignature: "deposit(address,uint256)",
      abiParameters: [
        USDC_ADDRESS,
        parseBalance(DEPOSIT_AMOUNT_USDC).toString(),
      ],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const depositTxId = depositTx.data?.id;
    if (!depositTxId) throw new Error("Failed to create deposit transaction");

    await waitForTxCompletion(client, depositTxId, "Gateway deposit");
  }

  console.log(
    "Transaction complete. Once finality is reached, Gateway credits your unified USDC balance.",
  );
}

main().catch((error) => {
  console.error("\nError:", error?.response?.data ?? error);
  process.exit(1);
});