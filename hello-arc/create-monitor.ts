import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const contractClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function createEventMonitor() {
  try {
    const response = await contractClient.createEventMonitor({
      blockchain: "ARC-TESTNET",
      contractAddress: process.env.CONTRACT_ADDRESS,
      eventSignature: "Transfer(address,address,uint256)",
    });

    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error creating event monitor:", error.message);
    throw error;
  }
}

createEventMonitor();