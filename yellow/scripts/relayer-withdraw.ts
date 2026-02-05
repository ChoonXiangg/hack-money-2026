/**
 * Relayer Balance Check Script
 *
 * This script checks the relayer's balances in both:
 * 1. Yellow Network ledger (off-chain)
 * 2. On-chain ERC20 wallet
 *
 * IMPORTANT: The new flow uses DIRECT on-chain ERC20 transfers.
 * Users transfer ytest.usd directly to the relayer's wallet when ending
 * their session. The relayer receives actual ERC20 tokens they can
 * swap/exchange immediately - no Yellow withdrawal needed!
 *
 * The Yellow ledger balance shown here is from the OLD off-chain transfer
 * approach and cannot be withdrawn (it's not in the custody contract).
 */

import 'dotenv/config';
import {
    NitroliteClient,
    WalletStateSigner,
    createECDSAMessageSigner,
    createEIP712AuthMessageSigner,
    createAuthRequestMessage,
    createAuthVerifyMessageFromChallenge,
    createGetLedgerBalancesMessage,
} from '@erc7824/nitrolite';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import WebSocket from 'ws';
import { formatUSDCDisplay, RELAYER_ADDRESS, DEFAULT_TOKEN_ADDRESS, CONTRACT_ADDRESSES } from '../src/config';

// Configuration
const WS_URL = 'wss://clearnet-sandbox.yellow.com/ws';

async function main() {
    console.log('='.repeat(60));
    console.log('Relayer Balance Check');
    console.log('='.repeat(60));
    console.log(`Relayer Address: ${RELAYER_ADDRESS}`);
    console.log(`Token: ${DEFAULT_TOKEN_ADDRESS}`);
    console.log('');

    // Get relayer private key from environment
    const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;

    if (!RELAYER_PRIVATE_KEY) {
        console.error('RELAYER_PRIVATE_KEY not found in .env');
        console.log('Please add your relayer private key to .env:');
        console.log('RELAYER_PRIVATE_KEY=0x...');
        process.exit(1);
    }

    const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);

    // Verify this is the relayer address
    if (account.address.toLowerCase() !== RELAYER_ADDRESS.toLowerCase()) {
        console.error(`Private key does not match relayer address!`);
        console.error(`Expected: ${RELAYER_ADDRESS}`);
        console.error(`Got: ${account.address}`);
        process.exit(1);
    }

    console.log('✓ Relayer address verified');

    // Setup clients
    const RPC_URL = process.env.ALCHEMY_RPC_URL || 'https://1rpc.io/sepolia';
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL),
    });
    const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(RPC_URL),
    });

    // Initialize Nitrolite Client
    const nitroliteClient = new NitroliteClient({
        publicClient,
        walletClient,
        addresses: CONTRACT_ADDRESSES.sepolia,
        challengeDuration: 3600n,
        chainId: sepolia.id,
        stateSigner: new WalletStateSigner(walletClient),
    });

    // Connect to WebSocket
    console.log('\n[Step 1] Connecting to Yellow Network...');
    const ws = new WebSocket(WS_URL);
    const sessionPrivateKey = generatePrivateKey();
    const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
    const sessionAccount = privateKeyToAccount(sessionPrivateKey);

    await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', (err) => reject(err));
    });
    console.log('✓ Connected to ClearNode');

    // Authenticate
    console.log('\n[Step 2] Authenticating...');
    const authParams = {
        session_key: sessionAccount.address,
        allowances: [{ asset: 'ytest.usd', amount: '1000000000' }],
        expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
        scope: 'relayer.withdraw',
    };

    const authRequestMsg = await createAuthRequestMessage({
        address: account.address,
        application: 'Relayer',
        ...authParams
    });
    ws.send(authRequestMsg);

    // Handle messages
    let authenticated = false;
    let ledgerBalance = 0n;

    ws.on('message', async (data) => {
        const response = JSON.parse(data.toString());

        if (response.res) {
            const type = response.res[1];

            if (type === 'auth_challenge') {
                const challenge = response.res[2].challenge_message;
                const signer = createEIP712AuthMessageSigner(walletClient, authParams, { name: 'Relayer' });
                const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
                ws.send(verifyMsg);
            }

            if (type === 'auth_verify') {
                console.log('✓ Authenticated');
                authenticated = true;

                // Request ledger balances
                console.log('\n[Step 3] Checking Yellow ledger balance...');
                const ledgerMsg = await createGetLedgerBalancesMessage(
                    sessionSigner,
                    account.address,
                    Date.now()
                );
                ws.send(ledgerMsg);
            }

            if (type === 'get_ledger_balances') {
                const balances = response.res[2];
                console.log('Ledger balances:', JSON.stringify(balances, null, 2));

                // Find ytest.usd balance
                if (balances.ledger_balances) {
                    for (const balance of balances.ledger_balances) {
                        if (balance.asset === 'ytest.usd' || balance.token?.toLowerCase() === DEFAULT_TOKEN_ADDRESS.toLowerCase()) {
                            ledgerBalance = BigInt(balance.amount || balance.available || '0');
                            break;
                        }
                    }
                }

                console.log(`Yellow Ledger Balance (off-chain): ${formatUSDCDisplay(ledgerBalance)}`);
                if (ledgerBalance > 0n) {
                    console.log('  Note: This is from old off-chain transfers and cannot be withdrawn.');
                }

                // Check on-chain ERC20 balance (this is what matters now!)
                console.log('\n[Step 4] Checking on-chain ERC20 balance...');

                try {
                    const onChainBalance = await publicClient.readContract({
                        address: DEFAULT_TOKEN_ADDRESS,
                        abi: [{ type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
                        functionName: 'balanceOf',
                        args: [account.address],
                    }) as bigint;

                    console.log(`\n${'='.repeat(60)}`);
                    console.log('RELAYER BALANCE SUMMARY');
                    console.log('='.repeat(60));
                    console.log(`  On-chain ytest.usd (ERC20): ${formatUSDCDisplay(onChainBalance)}`);
                    console.log(`  Yellow Ledger (off-chain):  ${formatUSDCDisplay(ledgerBalance)}`);
                    console.log('');
                    console.log('The on-chain balance is what you can swap/exchange.');
                    console.log('Users transfer ERC20 tokens directly to your wallet when');
                    console.log('they end their music streaming sessions.');

                    if (onChainBalance > 0n) {
                        console.log(`\n✓ You have ${formatUSDCDisplay(onChainBalance)} ready to swap on a DEX!`);
                        console.log(`  View on Etherscan: https://sepolia.etherscan.io/address/${account.address}`);
                    } else {
                        console.log('\nNo on-chain tokens yet. Run a user session to receive payments.');
                    }
                } catch (error) {
                    console.error('Error checking on-chain balance:', error);
                }

                ws.close();
                process.exit(0);
            }
        }

        if (response.error) {
            console.error('Error:', response.error);
        }
    });
}

main().catch(console.error);
