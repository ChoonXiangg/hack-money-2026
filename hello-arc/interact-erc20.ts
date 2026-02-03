import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function main() {
  // Mint tokens
  const mintResponse =
    await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: process.env.WALLET_ID,
      abiFunctionSignature: "mintTo(address,uint256)",
      abiParameters: [
        process.env.WALLET_ADDRESS,
        "1000000000000000000", // 1 token with 18 decimals
      ],
      contractAddress: process.env.CONTRACT_ADDRESS,
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM",
        },
      },
    });

  console.log(JSON.stringify(mintResponse.data, null, 2));

  // Transfer tokens
  const transferResponse =
    await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: process.env.WALLET_ID,
      abiFunctionSignature: "transfer(address,uint256)",
      abiParameters: [
        process.env.RECIPIENT_WALLET_ADDRESS,
        "1000000000000000000", // 1 token with 18 decimals
      ],
      contractAddress: process.env.CONTRACT_ADDRESS,
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM",
        },
      },
    });

  console.log(JSON.stringify(transferResponse.data, null, 2));
}

main();