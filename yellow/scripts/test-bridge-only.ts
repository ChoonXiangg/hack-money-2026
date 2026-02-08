/**
 * Minimal Test: Just bridge from Sepolia to Arc
 */
import 'dotenv/config';
import { gatewayTransfer, getGatewayBalance, formatUSDC } from '../src/gateway';
import type { Address, Hex } from 'viem';

const RELAYER_SEPOLIA = '0xC0df42b03E9438dc744935578B4FA90344937FC6' as Address;
const RELAYER_ARC_HUB = '0x843b9ec5c49092bbf874acbacb397d2c252e36a4' as Address;

async function main() {
    console.log('=== PRE-BRIDGE CHECK ===');

    // Check Gateway balance
    const gwBal = await getGatewayBalance('Ethereum_Sepolia', RELAYER_SEPOLIA);
    console.log(`Gateway available: ${formatUSDC(gwBal.available)} USDC`);

    if (gwBal.available < BigInt(5_000_000)) {
        console.log('ERROR: Not enough in Gateway! Need at least 5 USDC');
        return;
    }

    console.log('\n=== BRIDGE: Sepolia → Arc ===');
    console.log(`Amount: 5 USDC`);
    console.log(`To: ${RELAYER_ARC_HUB}`);

    try {
        const result = await gatewayTransfer(
            'Ethereum_Sepolia',
            'Arc_Testnet',
            '5',
            RELAYER_ARC_HUB
        );

        console.log('\n✓ BRIDGE SUCCESSFUL!');
        console.log('Transaction Hashes:');
        console.log(`  Burn Signature: ${result.burnIntentSignature.slice(0, 30)}...`);
        console.log(`  Attestation: ${result.attestation.slice(0, 30)}...`);
        console.log(`  🔗 MINT TX (Arc): ${result.mintTxHash}`);
        console.log(`  Explorer: https://testnet.arcscan.app/tx/${result.mintTxHash}`);
    } catch (error) {
        console.log('\n✗ BRIDGE FAILED:');
        console.log(error instanceof Error ? error.message : error);
    }
}

main().catch(console.error);
