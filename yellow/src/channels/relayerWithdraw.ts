/**
 * Relayer Withdrawal Module
 *
 * Provides automatic withdrawal of relayer funds from Yellow Network ledger
 * to on-chain wallet when an App Session closes.
 *
 * Flow:
 * 1. Connect and authenticate as relayer
 * 2. Query ledger balance
 * 3. Create channel → resize (ledger→channel) → close (channel→custody) → withdraw (custody→wallet)
 */

import { createPublicClient, createWalletClient, http, type Hash, type Address, type PublicClient } from 'viem';
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
import {
    formatUSDCDisplay,
    DEFAULT_TOKEN_ADDRESS,
    getRpcUrl,
    SEPOLIA_CHAIN_ID,
    CLEARNODE_URLS,
    CONTRACT_ADDRESSES,
} from '../config';

export interface RelayerWithdrawParams {
    /** Amount the relayer should receive (total spent by user) */
    expectedAmount: bigint;
}

export interface RelayerWithdrawResult {
    success: boolean;
    withdrawnAmount: bigint;
    txHash?: Hash;
    error?: string;
}

/**
 * Perform automatic relayer withdrawal from Yellow Network ledger to wallet
 * Called after session closes to withdraw the relayer's earned funds
 */
export async function performRelayerWithdrawal(
    params: RelayerWithdrawParams
): Promise<RelayerWithdrawResult> {
    const { expectedAmount } = params;

    // Skip if nothing to withdraw
    if (expectedAmount <= 0n) {
        console.log('  [Relayer] No funds to withdraw (0 spent)');
        return { success: true, withdrawnAmount: 0n };
    }

    console.log(`\n  [Relayer Withdrawal] Starting automatic withdrawal...`);
    console.log(`    Expected amount: ${formatUSDCDisplay(expectedAmount)}`);

    // Get relayer private key
    const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
    if (!RELAYER_PRIVATE_KEY) {
        console.log('  [Relayer] ⚠ RELAYER_PRIVATE_KEY not found, skipping withdrawal');
        return {
            success: false,
            withdrawnAmount: 0n,
            error: 'RELAYER_PRIVATE_KEY not found in environment',
        };
    }

    const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);
    const relayerAddress = account.address;

    console.log(`    Relayer address: ${relayerAddress}`);

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

    // Generate session key for authentication
    const sessionPrivateKey = generatePrivateKey();
    const sessionAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);

    // Auth params
    const authParams = {
        session_key: sessionAccount.address,
        allowances: [{ asset: 'ytest.usd', amount: '1000000000' }],
        expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
        scope: 'relayer.withdraw',
    };

    const authRequestMsg = await createAuthRequestMessage({
        address: relayerAddress,
        application: 'MusicStream Relayer',
        ...authParams,
    });

    // Connect to Yellow Network
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

    try {
        // Connect and authenticate
        let ledgerBalance = 0n;
        let isAuthenticated = false;

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Timeout during relayer authentication'));
            }, 30000);

            ws.onopen = () => {
                console.log('    Connected to Yellow Network');
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
                        console.error('    RPC Error:', response.error);
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
                            { name: 'MusicStream Relayer' }
                        );
                        const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
                        ws.send(verifyMsg);
                    }

                    // Handle auth_verify success
                    if (response.res && response.res[1] === 'auth_verify') {
                        console.log('    ✓ Relayer authenticated');
                        isAuthenticated = true;

                        // Query ledger balances
                        const ledgerMsg = await createGetLedgerBalancesMessage(
                            sessionSigner,
                            relayerAddress,
                            Date.now()
                        );
                        ws.send(ledgerMsg);
                    }

                    // Handle ledger balances response
                    if (response.res && response.res[1] === 'get_ledger_balances') {
                        const balances = response.res[2];
                        const ledgerBalances = balances.ledger_balances || balances.balances || balances;
                        if (Array.isArray(ledgerBalances)) {
                            const usdBalance = ledgerBalances.find((b: any) => b.asset === 'ytest.usd');
                            if (usdBalance) {
                                // Handle both integer and decimal values from API
                                const rawValue = usdBalance.available || usdBalance.amount || 0;
                                // Convert to integer (truncate decimals) before BigInt
                                ledgerBalance = BigInt(Math.floor(Number(rawValue)));
                            }
                        }

                        console.log(`    Ledger balance: ${formatUSDCDisplay(ledgerBalance)}`);
                        clearTimeout(timeout);
                        resolve();
                    }
                } catch (err) {
                    console.error('    Error parsing message:', err);
                }
            };
        });

        // Check if there's enough in ledger to withdraw the expected amount
        if (ledgerBalance < expectedAmount) {
            console.log(`    ⚠ Ledger balance (${formatUSDCDisplay(ledgerBalance)}) less than expected (${formatUSDCDisplay(expectedAmount)})`);
            // Withdraw whatever is available
        }

        // Use expectedAmount (session's spent amount), not full ledger balance
        const withdrawAmount = expectedAmount <= ledgerBalance ? expectedAmount : ledgerBalance;

        // Perform withdrawal: create channel → resize → close → withdraw
        console.log(`    Withdrawing ${formatUSDCDisplay(withdrawAmount)} from ledger (session amount)...`);

        // Step 1: Create channel
        const createChannelMsg = await createCreateChannelMessage(
            sessionSigner,
            {
                chain_id: SEPOLIA_CHAIN_ID,
                token: DEFAULT_TOKEN_ADDRESS,
            }
        );
        ws.send(createChannelMsg);

        const createResponse = await waitForMessage('create_channel');
        const channelId = createResponse.channel_id;
        const channelToken = createResponse.state?.allocations?.[0]?.token || DEFAULT_TOKEN_ADDRESS;
        console.log(`    ✓ Channel created: ${channelId.slice(0, 20)}...`);

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
        await publicClient.waitForTransactionReceipt({ hash: createTxHash as Hash });

        // Wait for node to index
        await new Promise(r => setTimeout(r, 5000));

        // Step 2: Resize channel (move expectedAmount from ledger, not full balance)
        const resizeMsg = await createResizeChannelMessage(
            sessionSigner,
            {
                channel_id: channelId as `0x${string}`,
                allocate_amount: withdrawAmount,
                funds_destination: relayerAddress,
            }
        );
        ws.send(resizeMsg);

        const resizeResponse = await waitForMessage('resize_channel');

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

        let proofStates: any[] = [];
        try {
            const onChainData = await nitroliteClient.getChannelData(channelId as `0x${string}`);
            if (onChainData.lastValidState) {
                proofStates = [onChainData.lastValidState];
            }
        } catch (e) {
            // OK to proceed without proof
        }

        const { txHash: resizeTxHash } = await nitroliteClient.resizeChannel({
            resizeState,
            proofStates,
        });
        await publicClient.waitForTransactionReceipt({ hash: resizeTxHash as Hash });

        await new Promise(r => setTimeout(r, 3000));

        // Step 3: Close channel
        const closeMsg = await createCloseChannelMessage(
            sessionSigner,
            channelId as `0x${string}`,
            relayerAddress
        );
        ws.send(closeMsg);

        const closeResponse = await waitForMessage('close_channel');

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
        await publicClient.waitForTransactionReceipt({ hash: closeTxHash as Hash });

        await new Promise(r => setTimeout(r, 2000));

        // Step 4: Withdraw from custody
        const custodyBalance = await nitroliteClient.getAccountBalance(channelToken as `0x${string}`);
        let withdrawTxHash: Hash | undefined;

        if (custodyBalance > 0n) {
            withdrawTxHash = await nitroliteClient.withdrawal(channelToken as `0x${string}`, custodyBalance);
            await publicClient.waitForTransactionReceipt({ hash: withdrawTxHash as Hash });
            console.log(`    ✓ Relayer withdrawn: ${formatUSDCDisplay(custodyBalance)}`);
            console.log(`    TX: ${withdrawTxHash}`);
        }

        ws.close();

        return {
            success: true,
            withdrawnAmount: withdrawAmount,  // Return the session amount we withdrew
            txHash: withdrawTxHash,
        };

    } catch (error) {
        ws.close();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`    ⚠ Relayer withdrawal failed: ${errorMessage}`);
        return {
            success: false,
            withdrawnAmount: 0n,
            error: errorMessage,
        };
    }
}
