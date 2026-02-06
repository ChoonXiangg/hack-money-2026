import {
    createECDSAMessageSigner,
    createEIP712AuthMessageSigner,
    createAuthRequestMessage,
    createAuthVerifyMessageFromChallenge,
    createGetConfigMessage,
} from '@erc7824/nitrolite';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { WalletClient, Address } from 'viem';
import WebSocket from 'ws';
import type { AuthParams, AuthState, ClearNodeConfig } from './types';
import { SESSION_CONFIG, CLEARNODE_URLS } from './config';

// ============================================================================
// Session Key Management
// ============================================================================

export interface SessionKeyPair {
    privateKey: `0x${string}`;
    address: Address;
    signer: ReturnType<typeof createECDSAMessageSigner>;
}

/**
 * Generate a new session keypair for signing off-chain messages
 */
export function generateSessionKeyPair(): SessionKeyPair {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const signer = createECDSAMessageSigner(privateKey);

    return {
        privateKey,
        address: account.address,
        signer,
    };
}

// ============================================================================
// Auth Parameters Builder
// ============================================================================

/**
 * Create authentication parameters for a session
 */
export function createAuthParams(sessionKeyAddress: Address): AuthParams {
    return {
        session_key: sessionKeyAddress,
        allowances: [{
            asset: 'ytest.usd',
            amount: SESSION_CONFIG.maxAllowance,
        }],
        expires_at: BigInt(Math.floor(Date.now() / 1000) + SESSION_CONFIG.sessionExpirySeconds),
        scope: SESSION_CONFIG.authScope,
    };
}

// ============================================================================
// Config Fetching
// ============================================================================

/**
 * Fetch configuration from Yellow ClearNode
 */
export async function fetchClearNodeConfig(
    privateKey: `0x${string}`,
    clearNodeUrl: string = CLEARNODE_URLS.sandbox
): Promise<ClearNodeConfig> {
    const signer = createECDSAMessageSigner(privateKey);
    const message = await createGetConfigMessage(signer);

    const ws = new WebSocket(clearNodeUrl);

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Config fetch timeout'));
        }, 30000);

        ws.onopen = () => {
            ws.send(message);
        };

        ws.onmessage = (event) => {
            try {
                const response = JSON.parse(event.data.toString());

                if (response.res && response.res[2]) {
                    clearTimeout(timeout);
                    resolve(response.res[2] as ClearNodeConfig);
                    ws.close();
                } else if (response.error) {
                    clearTimeout(timeout);
                    reject(new Error(response.error.message || 'Unknown RPC error'));
                    ws.close();
                }
            } catch (err) {
                clearTimeout(timeout);
                reject(err);
                ws.close();
            }
        };

        ws.onerror = (error) => {
            clearTimeout(timeout);
            reject(error);
            ws.close();
        };
    });
}

// ============================================================================
// Authentication Flow
// ============================================================================

export interface AuthenticationResult {
    success: boolean;
    sessionKey: Address;
    jwtToken?: string;
    error?: string;
}

/**
 * Handle the authentication challenge-response flow
 */
export async function handleAuthChallenge(
    ws: WebSocket,
    walletClient: WalletClient,
    authParams: AuthParams,
    challengeMessage: string
): Promise<string> {
    // Create EIP-712 typed data signer with main wallet
    const signer = createEIP712AuthMessageSigner(
        walletClient,
        authParams,
        { name: SESSION_CONFIG.applicationName }
    );

    // Create verify message from challenge
    const verifyMsg = await createAuthVerifyMessageFromChallenge(
        signer,
        challengeMessage
    );

    // Send verification
    ws.send(verifyMsg);

    return verifyMsg;
}

/**
 * Create and send an authentication request
 */
export async function createAndSendAuthRequest(
    ws: WebSocket,
    mainWalletAddress: Address,
    sessionKeyAddress: Address
): Promise<string> {
    const authParams = createAuthParams(sessionKeyAddress);

    const authRequestMsg = await createAuthRequestMessage({
        address: mainWalletAddress,
        application: SESSION_CONFIG.applicationName,
        ...authParams,
    });

    // Send when connected
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(authRequestMsg);
    } else {
        await new Promise<void>((resolve) => {
            ws.once('open', () => {
                ws.send(authRequestMsg);
                resolve();
            });
        });
    }

    return authRequestMsg;
}

// ============================================================================
// Auth State Management
// ============================================================================

/**
 * Create initial auth state
 */
export function createInitialAuthState(): AuthState {
    return {
        isAuthenticated: false,
        sessionKey: null,
        mainWalletAddress: null,
        jwtToken: null,
    };
}

/**
 * Update auth state after successful authentication
 */
export function updateAuthStateOnSuccess(
    currentState: AuthState,
    sessionKey: Address,
    mainWalletAddress: Address,
    jwtToken?: string
): AuthState {
    return {
        ...currentState,
        isAuthenticated: true,
        sessionKey,
        mainWalletAddress,
        jwtToken: jwtToken || null,
    };
}

/**
 * Reset auth state
 */
export function resetAuthState(): AuthState {
    return createInitialAuthState();
}
