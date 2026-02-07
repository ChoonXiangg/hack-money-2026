/**
 * Relayer Withdrawal Script (App Sessions Mode)
 *
 * In App Sessions mode, the relayer receives funds in their Yellow Network
 * LEDGER (unified balance) when app sessions close. This script:
 * 1. Connects to Yellow Network WebSocket
 * 2. Authenticates using EIP-712 signing
 * 3. Queries the relayer's LEDGER balance
 * 4. Creates a channel and moves funds from ledger to channel
 * 5. Closes channel to move funds to on-chain custody
 * 6. Withdraws from custody to wallet
 *
 * Usage:
 *   npm run relayer:withdraw
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, type Hash } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import {
    createECDSAMessageSigner,
    createEIP712AuthMessageSigner,
    createAuthRequestMessage,
    createAuthVerifyMessageFromChallenge,
    createGetLedgerBalancesMessage,
    createCreateChannelMessage,
    createResizeChannelMessage,
    createCloseChannelMessage,
} from '@erc7824/nitrolite';
import WebSocket from 'ws';
import { formatUSDCDisplay, DEFAULT_TOKEN_ADDRESS, getRpcUrl, SEPOLIA_CHAIN_ID, CLEARNODE_URLS, CONTRACT_ADDRESSES } from '../src/config';

// ERC20 ABI for balance checks
const ERC20_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view'
    }
] as const;

async function main() {
    console.log('='.repeat(60));
    console.log('Relayer Withdrawal (App Sessions Mode)');
    console.log('='.repeat(60));

    // Get relayer private key
    const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
    if (!RELAYER_PRIVATE_KEY) {
        console.error('❌ RELAYER_PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);
    const relayerAddress = account.address;

    console.log(`Relayer Address: ${relayerAddress}`);
    console.log(`Token: ${DEFAULT_TOKEN_ADDRESS}`);
    console.log('');

    // Setup clients
    const rpcUrl = getRpcUrl(SEPOLIA_CHAIN_ID);
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
        chain: sepolia,
        transport: http(rpcUrl),
        account,
    });

    // Create NitroliteClient for on-chain operations
    const nitroliteClient = new NitroliteClient({
        publicClient,
        walletClient,
        stateSigner: new WalletStateSigner(walletClient),
        addresses: CONTRACT_ADDRESSES.sepolia,
        chainId: SEPOLIA_CHAIN_ID,
        challengeDuration: 3600n,
    });

    // Check initial on-chain ERC20 balance
    console.log('[1] Checking Initial On-Chain Balance');
    const initialOnChainBalance = await publicClient.readContract({
        address: DEFAULT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [relayerAddress],
    });
    console.log(`  On-chain wallet: ${formatUSDCDisplay(initialOnChainBalance)}`);

    // Connect to Yellow Network and authenticate
    console.log('\n[2] Connecting to Yellow Network...');

    // Generate session key for authentication
    const sessionPrivateKey = generatePrivateKey();
    const sessionAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);

    // Auth params
    const authParams = {
        session_key: sessionAccount.address,
        allowances: [{ asset: 'ytest.usd', amount: '1000000000' }],
        expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
        scope: 'test.app',
    };

    const authRequestMsg = await createAuthRequestMessage({
        address: relayerAddress,
        application: 'Test app',
        ...authParams,
    });

    // Track state
    let ledgerBalance = 0n;
    let isAuthenticated = false;
    let channelId: string | null = null;
    let channelToken: string = DEFAULT_TOKEN_ADDRESS;

    const ws = new WebSocket(CLEARNODE_URLS.sandbox);

    // Helper to wait for specific message
    const waitForMessage = (method: string, timeoutMs = 30000): Promise<any> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), timeoutMs);
            const handler = (data: WebSocket.Data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.res && msg.res[1] === method) {
                        clearTimeout(timeout);
                        ws.off('message', handler);
                        resolve(msg.res[2]);
                    }
                    if (msg.error) {
                        clearTimeout(timeout);
                        ws.off('message', handler);
                        reject(new Error(msg.error.message || `Error in ${method}`));
                    }
                } catch { }
            };
            ws.on('message', handler);
        });
    };

    // Connect and authenticate
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout waiting for ledger balance'));
        }, 30000);

        ws.onopen = () => {
            console.log('  Connected to Yellow Network');
            ws.send(authRequestMsg);
        };

        ws.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
        };

        ws.onmessage = async (event) => {
            try {
                const response = JSON.parse(event.data.toString());

                if (response.error) {
                    console.error('  RPC Error:', response.error);
                    clearTimeout(timeout);
                    ws.close();
                    reject(new Error(response.error.message || 'RPC error'));
                    return;
                }

                // Handle auth_challenge
                if (response.res && response.res[1] === 'auth_challenge') {
                    if (isAuthenticated) return;

                    const challenge = response.res[2].challenge_message;
                    const signer = createEIP712AuthMessageSigner(
                        walletClient,
                        authParams,
                        { name: 'Test app' }
                    );
                    const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
                    ws.send(verifyMsg);
                }

                // Handle auth_verify success
                if (response.res && response.res[1] === 'auth_verify') {
                    console.log('  ✓ Authenticated');
                    isAuthenticated = true;

                    // Query ledger balances
                    const ledgerMsg = await createGetLedgerBalancesMessage(
                        sessionSigner,
                        relayerAddress,
                        Date.now()
                    );
                    ws.send(ledgerMsg);
                    console.log('  Querying ledger balance...');
                }

                // Handle ledger balances response
                if (response.res && response.res[1] === 'get_ledger_balances') {
                    const balances = response.res[2];

                    // Parse the balance for ytest.usd
                    const ledgerBalances = balances.ledger_balances || balances.balances || balances;
                    if (Array.isArray(ledgerBalances)) {
                        const usdBalance = ledgerBalances.find((b: any) => b.asset === 'ytest.usd');
                        if (usdBalance) {
                            ledgerBalance = BigInt(usdBalance.available || usdBalance.amount || 0);
                        }
                    }

                    console.log(`  Ledger balance: ${formatUSDCDisplay(ledgerBalance)}`);
                    clearTimeout(timeout);
                    resolve();
                }
            } catch (err) {
                console.error('  Error parsing message:', err);
            }
        };
    });

    // Check if there's anything to withdraw
    if (ledgerBalance === 0n) {
        console.log('\n✓ No funds in ledger to withdraw.');
        console.log(`  On-chain balance: ${formatUSDCDisplay(initialOnChainBalance)}`);
        ws.close();
        process.exit(0);
    }

    console.log(`\n[3] Withdrawing ${formatUSDCDisplay(ledgerBalance)} from Ledger to Wallet`);

    // Step 1: Create a channel
    console.log('  Creating channel...');
    const createChannelMsg = await createCreateChannelMessage(
        sessionSigner,
        {
            chain_id: SEPOLIA_CHAIN_ID,
            token: DEFAULT_TOKEN_ADDRESS,
        }
    );
    ws.send(createChannelMsg);

    // Wait for channel creation response
    const createResponse = await waitForMessage('create_channel');
    channelId = createResponse.channel_id;
    channelToken = createResponse.state?.allocations?.[0]?.token || DEFAULT_TOKEN_ADDRESS;
    console.log(`  ✓ Channel prepared: ${channelId}`);

    // Submit channel to blockchain
    const unsignedInitialState = {
        intent: createResponse.state.intent,
        version: BigInt(createResponse.state.version),
        data: createResponse.state.state_data,
        allocations: createResponse.state.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
        })),
    };

    const createResult = await nitroliteClient.createChannel({
        channel: createResponse.channel,
        unsignedInitialState,
        serverSignature: createResponse.server_signature,
    });
    const createTxHash = typeof createResult === 'string' ? createResult : createResult.txHash;
    console.log(`  ✓ Channel created on-chain: ${createTxHash}`);

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: createTxHash as Hash });
    console.log('  ✓ Transaction confirmed');

    // Wait for node to index
    console.log('  Waiting for node to index channel...');
    await new Promise(r => setTimeout(r, 5000));

    // Step 2: Resize channel with allocate_amount to move from ledger
    console.log(`  Moving ${formatUSDCDisplay(ledgerBalance)} from ledger to channel...`);
    const resizeMsg = await createResizeChannelMessage(
        sessionSigner,
        {
            channel_id: channelId as `0x${string}`,
            allocate_amount: ledgerBalance,
            funds_destination: relayerAddress,
        }
    );
    ws.send(resizeMsg);

    // Wait for resize response
    const resizeResponse = await waitForMessage('resize_channel');
    console.log('  ✓ Resize prepared');

    // Submit resize to blockchain
    const resizeState = {
        intent: resizeResponse.state.intent,
        version: BigInt(resizeResponse.state.version),
        data: resizeResponse.state.state_data || resizeResponse.state.data,
        allocations: resizeResponse.state.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
        })),
        channelId: channelId,
        serverSignature: resizeResponse.server_signature,
    };

    console.log('  Fetching on-chain state for proof...');
    let proofStates: any[] = [];
    try {
        const onChainData = await nitroliteClient.getChannelData(channelId as `0x${string}`);
        if (onChainData.lastValidState) {
            proofStates = [onChainData.lastValidState];
            console.log(`  ✓ Got proof state (version: ${onChainData.lastValidState.version})`);
        }
    } catch (e) {
        console.log('  ⚠ Could not get on-chain proof state:', e);
    }

    const { txHash: resizeTxHash } = await nitroliteClient.resizeChannel({
        resizeState,
        proofStates,
    });
    console.log(`  ✓ Channel resized on-chain: ${resizeTxHash}`);

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: resizeTxHash as Hash });
    console.log('  ✓ Resize confirmed');

    // Wait a moment for state to settle
    await new Promise(r => setTimeout(r, 3000));

    // Step 3: Close channel to move funds to custody
    console.log('  Closing channel...');
    const closeMsg = await createCloseChannelMessage(
        sessionSigner,
        channelId as `0x${string}`,
        relayerAddress
    );
    ws.send(closeMsg);

    // Wait for close response
    const closeResponse = await waitForMessage('close_channel');
    console.log('  ✓ Close prepared');

    // Submit close to blockchain
    const closeTxHash = await nitroliteClient.closeChannel({
        finalState: {
            intent: closeResponse.state.intent,
            version: BigInt(closeResponse.state.version),
            data: closeResponse.state.state_data || closeResponse.state.data,
            allocations: closeResponse.state.allocations.map((a: any) => ({
                destination: a.destination,
                token: a.token,
                amount: BigInt(a.amount),
            })),
            channelId: channelId,
            serverSignature: closeResponse.server_signature,
        } as any,
        stateData: closeResponse.state.state_data || closeResponse.state.data || '0x',
    });
    console.log(`  ✓ Channel closed on-chain: ${closeTxHash}`);

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: closeTxHash as Hash });
    console.log('  ✓ Close confirmed');

    // Wait for close to settle
    await new Promise(r => setTimeout(r, 2000));

    // Step 4: Withdraw from custody to wallet
    console.log('\n[4] Withdrawing from Custody to Wallet');

    // Check custody balance
    const custodyBalance = await nitroliteClient.getAccountBalance(channelToken as `0x${string}`);
    console.log(`  Custody balance: ${formatUSDCDisplay(custodyBalance)}`);

    if (custodyBalance > 0n) {
        const withdrawTxHash = await nitroliteClient.withdrawal(channelToken as `0x${string}`, custodyBalance);
        console.log(`  ✓ Withdrawal TX: ${withdrawTxHash}`);

        // Wait for confirmation
        await publicClient.waitForTransactionReceipt({ hash: withdrawTxHash as Hash });
        console.log('  ✓ Withdrawal confirmed');
    }

    ws.close();

    // Check final on-chain balance
    const finalOnChainBalance = await publicClient.readContract({
        address: DEFAULT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [relayerAddress],
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('WITHDRAWAL COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Initial on-chain:  ${formatUSDCDisplay(initialOnChainBalance)}`);
    console.log(`  Withdrawn:         ${formatUSDCDisplay(ledgerBalance)}`);
    console.log(`  Final on-chain:    ${formatUSDCDisplay(finalOnChainBalance)}`);
    console.log('');
    console.log(`View on Etherscan: https://sepolia.etherscan.io/address/${relayerAddress}`);

    process.exit(0);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
