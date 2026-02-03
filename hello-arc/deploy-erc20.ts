import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const circleContractSdk = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const response = await circleContractSdk.deployContractTemplate({
  id: "a1b74add-23e0-4712-88d1-6b3009e85a86",
  blockchain: "ARC-TESTNET",
  name: "MyTokenContract",
  walletId: process.env.WALLET_ID,
  templateParameters: {
    name: "MyToken",
    symbol: "MTK",
    defaultAdmin: process.env.WALLET_ADDRESS,
    primarySaleRecipient: process.env.WALLET_ADDRESS,
  },
  fee: {
    type: "level",
    config: {
      feeLevel: "MEDIUM",
    },
  },
});

console.log(JSON.stringify(response.data, null, 2));