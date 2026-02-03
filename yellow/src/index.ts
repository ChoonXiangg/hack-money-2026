import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  // Verify environment variables
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log('✓ Wallet loaded:', account.address);

  // Create public client
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });

  // Check connection
  const blockNumber = await client.getBlockNumber();
  console.log('✓ Connected to Sepolia, block:', blockNumber);

  // Check balance
  const balance = await client.getBalance({ address: account.address });
  console.log('✓ ETH balance:', balance.toString(), 'wei');

  console.log('\n🎉 Environment setup complete!');
}

main().catch(console.error);