import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  pad,
  toHex,
  maxUint256,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, avalancheFuji, baseSepolia } from "viem/chains";

// ===== Chain Configuration =====

// Arc Testnet chain definition (not in viem by default)
const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://testnet.arcscan.app" },
  },
};

// Gateway domain IDs (CCTP v2 domains)
export const DOMAIN_IDS: Record<string, number> = {
  Arc_Testnet: 26,
  Ethereum_Sepolia: 0,
  Base_Sepolia: 6,
  Avalanche_Fuji: 1,
};

// USDC contract addresses per testnet chain
export const USDC_ADDRESSES: Record<string, Address> = {
  Arc_Testnet: "0x3600000000000000000000000000000000000000",
  Ethereum_Sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  Base_Sepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  Avalanche_Fuji: "0x5425890298aed601595a70AB815c96711a31Bc65",
};

// Viem chain objects per chain ID
const CHAIN_CONFIGS: Record<string, Chain> = {
  Arc_Testnet: arcTestnet,
  Ethereum_Sepolia: sepolia,
  Base_Sepolia: baseSepolia,
  Avalanche_Fuji: avalancheFuji,
};

// ===== Gateway Contract Addresses (same on all EVM testnets) =====

const GATEWAY_WALLET: Address = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER: Address = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";

// Gateway attestation API
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

// ===== ABIs =====

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const GATEWAY_WALLET_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "availableBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "domain",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
] as const;

const GATEWAY_MINTER_ABI = [
  {
    name: "gatewayMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// ===== EIP-712 Types for Burn Intents =====

const EIP712_DOMAIN = {
  name: "GatewayWallet",
  version: "1",
} as const;

const BURN_INTENT_TYPES = {
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
} as const;

// ===== Helper Functions =====

function getAccount() {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing EVM_PRIVATE_KEY in environment");
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(key as Hex);
}

function getClients(chainName: string) {
  const chain = CHAIN_CONFIGS[chainName];
  if (!chain) throw new Error(`Unsupported chain: ${chainName}`);

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  const account = getAccount();
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  return { publicClient, walletClient, account };
}

function addressToBytes32(addr: Address): Hex {
  return pad(addr, { size: 32 }) as Hex;
}

function generateSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes) as Hex;
}

// ===== Public API =====

/**
 * Get USDC balance on a specific chain (direct on-chain balance, not Gateway)
 */
export async function getChainBalance(
  chainName: string,
  address: Address
): Promise<bigint> {
  const usdcAddress = USDC_ADDRESSES[chainName];
  if (!usdcAddress) return BigInt(0);

  const { publicClient } = getClients(chainName);
  return publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

/**
 * Get Gateway unified balance for a depositor on a specific chain
 */
export async function getGatewayBalance(
  chainName: string,
  depositor: Address
): Promise<{ available: bigint; total: bigint }> {
  const usdcAddress = USDC_ADDRESSES[chainName];
  if (!usdcAddress) return { available: BigInt(0), total: BigInt(0) };

  const { publicClient } = getClients(chainName);

  const [available, total] = await Promise.all([
    publicClient.readContract({
      address: GATEWAY_WALLET,
      abi: GATEWAY_WALLET_ABI,
      functionName: "availableBalance",
      args: [usdcAddress, depositor],
    }),
    publicClient.readContract({
      address: GATEWAY_WALLET,
      abi: GATEWAY_WALLET_ABI,
      functionName: "totalBalance",
      args: [usdcAddress, depositor],
    }),
  ]);

  return { available, total };
}

/**
 * Get unified Gateway balance across all supported chains
 */
export async function getUnifiedGatewayBalance(
  depositor: Address
): Promise<{
  perChain: Record<string, { available: string; total: string }>;
  totalAvailable: string;
}> {
  const chains = Object.keys(DOMAIN_IDS);
  const results = await Promise.allSettled(
    chains.map(async (chain) => {
      const bal = await getGatewayBalance(chain, depositor);
      return { chain, ...bal };
    })
  );

  let totalAvailable = BigInt(0);
  const perChain: Record<string, { available: string; total: string }> = {};

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { chain, available, total } = result.value;
      perChain[chain] = {
        available: formatUSDC(available),
        total: formatUSDC(total),
      };
      totalAvailable += available;
    }
  }

  return { perChain, totalAvailable: formatUSDC(totalAvailable) };
}

/**
 * Deposit USDC into Gateway Wallet on a specific chain.
 * Performs: approve → deposit
 */
export async function depositToGateway(
  sourceChain: string,
  amount: string
): Promise<{ approvalTxHash: Hex; depositTxHash: Hex }> {
  const usdcAddress = USDC_ADDRESSES[sourceChain];
  if (!usdcAddress) throw new Error(`No USDC address for chain: ${sourceChain}`);

  const { publicClient, walletClient, account } = getClients(sourceChain);
  const value = parseUnits(amount, 6); // USDC has 6 decimals

  // Step 1: Approve Gateway Wallet to spend USDC
  const approvalTxHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [GATEWAY_WALLET, value],
  });
  await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });

  // Step 2: Deposit into Gateway Wallet
  const depositTxHash = await walletClient.writeContract({
    address: GATEWAY_WALLET,
    abi: GATEWAY_WALLET_ABI,
    functionName: "deposit",
    args: [usdcAddress, value],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

  return { approvalTxHash, depositTxHash };
}

/**
 * Transfer USDC from one chain to another via Gateway.
 * Full flow: create burn intent → sign → get attestation → mint on destination.
 */
export async function gatewayTransfer(
  sourceChain: string,
  destinationChain: string,
  amount: string,
  recipientAddress: Address
): Promise<{
  burnIntentSignature: Hex;
  attestation: Hex;
  operatorSignature: Hex;
  mintTxHash: Hex;
}> {
  const sourceUSDC = USDC_ADDRESSES[sourceChain];
  const destUSDC = USDC_ADDRESSES[destinationChain];
  const sourceDomain = DOMAIN_IDS[sourceChain];
  const destDomain = DOMAIN_IDS[destinationChain];

  if (!sourceUSDC || !destUSDC) throw new Error("Missing USDC address for chain");
  if (sourceDomain === undefined || destDomain === undefined) throw new Error("Missing domain ID for chain");

  const { publicClient: sourcePublic, walletClient: sourceWallet, account } = getClients(sourceChain);
  const { publicClient: destPublic, walletClient: destWallet } = getClients(destinationChain);

  const value = parseUnits(amount, 6);

  // maxFee >= gas fee + (transfer amount * 0.00005)
  // Arc gas ~$0.001, so 0.005 USDC covers gas + transfer fee for small amounts
  const maxFee = BigInt(5000); // 0.005 USDC

  // Use MAX_UINT256 for maxBlockHeight (no expiry, as recommended by docs)
  const maxBlockHeight = maxUint256;

  const salt = generateSalt();

  // Build the TransferSpec
  const transferSpec = {
    version: 1,
    sourceDomain,
    destinationDomain: destDomain,
    sourceContract: addressToBytes32(GATEWAY_WALLET),
    destinationContract: addressToBytes32(GATEWAY_MINTER),
    sourceToken: addressToBytes32(sourceUSDC),
    destinationToken: addressToBytes32(destUSDC),
    sourceDepositor: addressToBytes32(account.address),
    destinationRecipient: addressToBytes32(recipientAddress),
    sourceSigner: addressToBytes32(account.address),
    destinationCaller: addressToBytes32("0x0000000000000000000000000000000000000000"),
    value,
    salt,
    hookData: "0x" as Hex,
  };

  const burnIntent = {
    maxBlockHeight,
    maxFee,
    spec: transferSpec,
  };

  // Sign the burn intent using EIP-712 (single BurnIntent, not BurnIntentSet)
  const signature = await sourceWallet.signTypedData({
    domain: EIP712_DOMAIN,
    types: BURN_INTENT_TYPES,
    primaryType: "BurnIntent",
    message: burnIntent,
  });

  // Submit to Gateway API for attestation
  const apiResponse = await fetch(GATEWAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      [{ burnIntent, signature }],
      (_key, val) => (typeof val === "bigint" ? val.toString() : val)
    ),
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`Gateway API error (${apiResponse.status}): ${errorText}`);
  }

  const apiResult = await apiResponse.json();
  const { attestation, signature: operatorSignature } = apiResult;

  // Mint on destination chain
  const mintTxHash = await destWallet.writeContract({
    address: GATEWAY_MINTER,
    abi: GATEWAY_MINTER_ABI,
    functionName: "gatewayMint",
    args: [attestation as Hex, operatorSignature as Hex],
  });
  await destPublic.waitForTransactionReceipt({ hash: mintTxHash });

  return {
    burnIntentSignature: signature,
    attestation: attestation as Hex,
    operatorSignature: operatorSignature as Hex,
    mintTxHash,
  };
}

/**
 * Direct ERC20 USDC transfer on a single chain (no Gateway needed).
 */
export async function directTransfer(
  chainName: string,
  amount: string,
  recipientAddress: Address
): Promise<Hex> {
  const usdcAddress = USDC_ADDRESSES[chainName];
  if (!usdcAddress) throw new Error(`No USDC address for chain: ${chainName}`);

  const { publicClient, walletClient } = getClients(chainName);
  const value = parseUnits(amount, 6);

  const txHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipientAddress, value],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return txHash;
}

// ===== Utilities =====

export function formatUSDC(raw: bigint): string {
  const million = BigInt(1000000);
  const whole = raw / million;
  const decimal = raw % million;
  return `${whole}.${decimal.toString().padStart(6, "0")}`;
}

export function getSupportedChains() {
  return Object.entries(DOMAIN_IDS).map(([id, domain]) => ({
    id,
    domain,
    name: id.replace(/_/g, " "),
    usdc: USDC_ADDRESSES[id],
    gatewayWallet: GATEWAY_WALLET,
    gatewayMinter: GATEWAY_MINTER,
  }));
}

export { GATEWAY_WALLET, GATEWAY_MINTER, GATEWAY_API_URL, CHAIN_CONFIGS, arcTestnet };
