import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const contractClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function getEventLogs() {
  try {
    const response = await contractClient.listEventLogs({
      contractAddress: process.env.CONTRACT_ADDRESS,
      blockchain: "ARC-TESTNET",
      pageSize: 10,
    });

    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error fetching event logs:", error.message);
    throw error;
  }
}

getEventLogs();