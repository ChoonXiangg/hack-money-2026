/**
 * Minimal Test: Check balances and deposit to Gateway
 */
import 'dotenv/config';
import { getGatewayBalance, getChainBalance, formatUSDC, depositToGateway } from '../src/gateway';
import type { Address } from 'viem';

const RELAYER = '0xC0df42b03E9438dc744935578B4FA90344937FC6' as Address;

async function main() {
    console.log('=== BALANCE CHECK ===');
    console.log('EVM_PRIVATE_KEY set:', !!process.env.EVM_PRIVATE_KEY);

    // Check wallet balance
    const walletBal = await getChainBalance('Ethereum_Sepolia', RELAYER);
    console.log(`Wallet USDC: ${formatUSDC(walletBal)}`);

    // Check Gateway balance
    const gwBal = await getGatewayBalance('Ethereum_Sepolia', RELAYER);
    console.log(`Gateway available: ${formatUSDC(gwBal.available)}`);
    console.log(`Gateway total: ${formatUSDC(gwBal.total)}`);

    // Deposit 10 USDC if needed
    if (gwBal.available < BigInt(10_000_000)) {
        console.log('\n=== DEPOSITING 10 USDC ===');
        const result = await depositToGateway('Ethereum_Sepolia', '10');
        console.log('Approval TX:', result.approvalTxHash);
        console.log('Deposit TX:', result.depositTxHash);

        // Check again
        const gwBal2 = await getGatewayBalance('Ethereum_Sepolia', RELAYER);
        console.log(`Gateway available after deposit: ${formatUSDC(gwBal2.available)}`);
    } else {
        console.log('Already have enough in Gateway');
    }
}

main().catch(console.error);
