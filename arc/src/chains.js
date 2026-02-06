// Supported blockchains for USDC payments via Circle Bridge Kit (CCTP)
// Chain identifiers match Circle's Bridge Kit naming convention

export const SUPPORTED_CHAINS = {
  // Testnet chains (for development)
  testnet: [
    { id: "Arc_Testnet", name: "Arc", isDefault: true },
    { id: "Ethereum_Sepolia", name: "Ethereum" },
    { id: "Arbitrum_Sepolia", name: "Arbitrum" },
    { id: "Avalanche_Fuji", name: "Avalanche" },
    { id: "Base_Sepolia", name: "Base" },
    { id: "Optimism_Sepolia", name: "Optimism" },
    { id: "Polygon_Amoy", name: "Polygon" },
    { id: "Unichain_Sepolia", name: "Unichain" },
    { id: "Solana_Devnet", name: "Solana" },
  ],

  // Mainnet chains (for production)
  mainnet: [
    { id: "Arc", name: "Arc", isDefault: true },
    { id: "Ethereum", name: "Ethereum" },
    { id: "Arbitrum", name: "Arbitrum" },
    { id: "Avalanche", name: "Avalanche" },
    { id: "Base", name: "Base" },
    { id: "Optimism", name: "Optimism" },
    { id: "Polygon", name: "Polygon" },
    { id: "Unichain", name: "Unichain" },
    { id: "Solana", name: "Solana" },
    { id: "Linea", name: "Linea" },
    { id: "Sonic", name: "Sonic" },
    { id: "World_Chain", name: "World Chain" },
  ],
};

// Current environment - change to 'mainnet' for production
export const CURRENT_ENV = "testnet";

// Get chains for current environment
export function getChains() {
  return SUPPORTED_CHAINS[CURRENT_ENV];
}

// Get default chain (Arc)
export function getDefaultChain() {
  const chains = getChains();
  return chains.find((c) => c.isDefault) || chains[0];
}

// Check if a chain ID is valid
export function isValidChain(chainId) {
  return getChains().some((c) => c.id === chainId);
}

// Check if chain requires bridging (not Arc)
export function requiresBridging(chainId) {
  const defaultChain = getDefaultChain();
  return chainId !== defaultChain.id;
}
