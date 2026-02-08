/**
 * Quick balance check script
 * Run: npx tsx scripts/check-arc-balances.ts
 */

import 'dotenv/config';
import { getChainBalance, formatUSDC } from '../src/gateway';
import type { Address } from 'viem';

const LISTENER_WALLET: Address = '0xC0df42b03E9438dc744935578B4FA90344937FC6';
const KENDRICK_ADDRESS: Address = '0x0F19F1F7e413AF44b79E30c1CC4A07a25f4eEE03';

async function main() {
    console.log('Arc Testnet USDC Balances:');
    console.log('');

    const listenerBalance = await getChainBalance('Arc_Testnet', LISTENER_WALLET);
    console.log(`Listener (${LISTENER_WALLET}): ${formatUSDC(listenerBalance)} USDC`);

    const kendrickBalance = await getChainBalance('Arc_Testnet', KENDRICK_ADDRESS);
    console.log(`Kendrick (${KENDRICK_ADDRESS}): ${formatUSDC(kendrickBalance)} USDC`);
}

main().catch(console.error);
