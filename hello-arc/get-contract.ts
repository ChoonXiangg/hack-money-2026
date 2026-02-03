import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const circleContractSdk = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const contractResponse = await circleContractSdk.getContract({
  id: process.env.CONTRACT_ID!,
});

const contract = contractResponse.data?.contract;
if (contract) {
  console.log(JSON.stringify({
    contract: {
      id: contract.id,
      contractAddress: contract.contractAddress,
      blockchain: contract.blockchain,
      status: contract.status,
    }
  }, null, 2));
} else {
  console.log("No contract found");
}