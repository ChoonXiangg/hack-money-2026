import 'dotenv/config';
import { createPublicClient, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { DEFAULT_TOKEN_ADDRESS, RELAYER_ADDRESS, CONTRACT_ADDRESSES } from '../src/config';

const RPC_URL = process.env.ALCHEMY_RPC_URL || 'https://1rpc.io/sepolia';
const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
});

const ERC20_ABI = [{
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
}] as const;

async function main() {
    const privateKey = process.env.PRIVATE_KEY as string;
    if (!privateKey) {
        console.error('PRIVATE_KEY not found in .env');
        process.exit(1);
    }
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    console.log('Checking balances...');
    console.log('User address:', account.address);
    console.log('Relayer address:', RELAYER_ADDRESS);
    console.log('Token:', DEFAULT_TOKEN_ADDRESS);
    console.log('');
    
    // User ytest.usd balance
    const userBalance = await publicClient.readContract({
        address: DEFAULT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
    });
    console.log('User ytest.usd balance:', formatUnits(userBalance, 6), 'USDC');
    
    // Relayer ytest.usd balance  
    const relayerBalance = await publicClient.readContract({
        address: DEFAULT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [RELAYER_ADDRESS],
    });
    console.log('Relayer ytest.usd balance:', formatUnits(relayerBalance, 6), 'USDC');
    
    // User ETH balance for gas
    const ethBalance = await publicClient.getBalance({ address: account.address });
    console.log('User ETH balance:', formatUnits(ethBalance, 18), 'ETH');
    
    // Check custody balance
    const custodyBalance = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.sepolia.custody,
        abi: [{
            type: 'function',
            name: 'getAccountsBalances',
            inputs: [{ name: 'users', type: 'address[]' }, { name: 'tokens', type: 'address[]' }],
            outputs: [{ type: 'uint256[]' }],
            stateMutability: 'view'
        }],
        functionName: 'getAccountsBalances',
        args: [[account.address], [DEFAULT_TOKEN_ADDRESS]],
    }) as bigint[];
    console.log('User custody balance:', formatUnits(custodyBalance[0] || 0n, 6), 'USDC');
}

main().catch(console.error);
