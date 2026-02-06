import {
    NitroliteClient,
    WalletStateSigner,
    createECDSAMessageSigner,
    createEIP712AuthMessageSigner,
    createAuthRequestMessage,
    createAuthVerifyMessageFromChallenge,
    createCloseChannelMessage,
} from '@erc7824/nitrolite';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import WebSocket from 'ws';
import 'dotenv/config';
import * as readline from 'readline';

// Helper to prompt for input
const askQuestion = (query: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
};

// Configuration
const WS_URL = 'wss://clearnet-sandbox.yellow.com/ws';

async function main() {
    console.log('Starting cleanup script...');

    // Setup Viem Clients
    let PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

    if (!PRIVATE_KEY) {
        console.log('PRIVATE_KEY not found in .env');
        const inputKey = await askQuestion('Please enter your Private Key: ');
        if (!inputKey) {
            throw new Error('Private Key is required');
        }
        PRIVATE_KEY = inputKey.startsWith('0x') ? inputKey as `0x${string}` : `0x${inputKey}` as `0x${string}`;
    }

    const account = privateKeyToAccount(PRIVATE_KEY);

    const ALCHEMY_RPC_URL = process.env.ALCHEMY_RPC_URL;
    const FALLBACK_RPC_URL = 'https://1rpc.io/sepolia'; // Public fallback
    const RPC_URL = ALCHEMY_RPC_URL || FALLBACK_RPC_URL;
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
    const client = new NitroliteClient({
        publicClient,
        walletClient,
        addresses: {
            custody: '0x019B65A265EB3363822f2752141b3dF16131b262',
            adjudicator: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2',
        },
        challengeDuration: 3600n,
        chainId: sepolia.id,
        stateSigner: new WalletStateSigner(walletClient),
    });

    // Connect to WebSocket
    const ws = new WebSocket(WS_URL);
    const sessionPrivateKey = generatePrivateKey();
    const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
    const sessionAccount = privateKeyToAccount(sessionPrivateKey);

    await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', (err) => reject(err));
    });
    console.log('✓ Connected to WebSocket');

    // Authenticate
    const authParams = {
        session_key: sessionAccount.address,
        allowances: [{ asset: 'ytest.usd', amount: '1000000000' }],
        expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
        scope: 'test.app',
    };

    const authRequestMsg = await createAuthRequestMessage({
        address: account.address,
        application: 'Test app',
        ...authParams
    });
    ws.send(authRequestMsg);

    ws.on('message', async (data) => {
        const response = JSON.parse(data.toString());

        if (response.res) {
            const type = response.res[1];

            if (type === 'auth_challenge') {
                const challenge = response.res[2].challenge_message;
                const signer = createEIP712AuthMessageSigner(walletClient, authParams, { name: 'Test app' });
                const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
                ws.send(verifyMsg);
            }

            if (type === 'auth_verify') {
                console.log('✓ Authenticated');

                // Fetch open channels from L1 Contract
                console.log('Fetching open channels from L1...');
                try {
                    const openChannelsL1 = await client.getOpenChannels();
                    console.log(`Found ${openChannelsL1.length} open channels on L1.`);

                    if (openChannelsL1.length === 0) {
                        console.log('No open channels on L1 to close.');
                        process.exit(0);
                    }

                    // Iterate and close
                    for (const channelId of openChannelsL1) {
                        console.log(`Attempting to close channel ${channelId}...`);

                        // Send close request to Node
                        const closeMsg = await createCloseChannelMessage(
                            sessionSigner,
                            channelId,
                            account.address
                        );
                        ws.send(closeMsg);

                        // Small delay to avoid rate limits
                        await new Promise(r => setTimeout(r, 500));
                    }

                } catch (e) {
                    console.error('Error fetching L1 channels:', e);
                    process.exit(1);
                }
            }

            if (type === 'close_channel') {
                const { channel_id, state, server_signature } = response.res[2];
                console.log(`✓ Node signed close for ${channel_id}`);

                const finalState = {
                    intent: state.intent,
                    version: BigInt(state.version),
                    data: state.state_data,
                    allocations: state.allocations.map((a: any) => ({
                        destination: a.destination,
                        token: a.token,
                        amount: BigInt(a.amount),
                    })),
                    channelId: channel_id,
                    serverSignature: server_signature,
                };

                try {
                    console.log(`  Submitting close to L1 for ${channel_id}...`);
                    const txHash = await client.closeChannel({
                        finalState,
                        stateData: finalState.data
                    });
                    console.log(`✓ Closed on-chain: ${txHash}`);
                } catch (e) {
                    // If it fails (e.g. already closed or race condition), just log and continue
                    console.error(`Failed to close ${channel_id} on-chain:`, e);
                }
            }

            if (response.error) {
                console.error('WS Error:', response.error);
            }
        }
    });
}

main();