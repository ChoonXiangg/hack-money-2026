# 🎵 LeStream: The Economic OS for Music Streaming

> **HackMoney 2026 Submission**  
> *Seamless Streaming. Instant Royalties.*  
> 🌍 **Live Demo**: [hack-money-2026-steel.vercel.app](https://hack-money-2026-steel.vercel.app)

---

## 📸 Screenshots

| Landing Page | Stream Credits (Yellow) |
| :---: | :---: |
| ![Landing Page](images/Screenshot%202026-02-08%20at%2008.02.23.png) | ![Stream Credits](images/Screenshot%202026-02-08%20at%2008.03.24.png) |

| Deposit Flow | Pay-Per-Second |
| :---: | :---: |
| ![Deposit Flow](images/Screenshot%202026-02-08%20at%2008.02.50.png) | ![Pay Per Second](images/Screenshot%202026-02-08%20at%2008.03.03.png) |

---

## 📚 Table of Contents

1.  [Overview](#-overview)
2.  [The Problem](#-the-problem)
3.  [The Solution](#-the-solution)
4.  [Architecture](#-architecture)
5.  [Core Integrations](#-core-integrations)
    *   [Yellow Network Integration](#1-yellow-network-integration-latency--fees)
    *   [Circle Arc Integration](#2-circle-arc-integration-liquidity--splits)
6.  [Technical Deep Dive](#-technical-deep-dive)
    *   [Yellow Backend API (State Channels)](#yellow-backend-api-state-channels)
    *   [Arc Scripts (Royalty Distribution)](#arc-scripts-royalty-distribution)
7.  [Installation & Setup](#-installation--setup)
8.  [Running the Application](#-running-the-application)
9.  [Demo Walkthrough](#-demo-walkthrough)
10. [Troubleshooting](#-troubleshooting)
11. [Security Considerations](#-security-considerations)
12. [Deployment](#-deployment)
13. [Future Roadmap](#-future-roadmap)
14. [Contributing](#-contributing)
15. [License](#-license)
16. [Acknowledgements](#-acknowledgements)

---

## 🚀 Overview

**LeStream** reimagines the music streaming economy by solving its three biggest problems: **Latency** and **Liquidity**.

Legacy streaming platforms are black boxes. Artists wait months for pennies, and payments are eaten by middlemen. Pro-rata payout models mean that even if you only listen to your favorite indie band, your subscription fee mostly goes to the top 1% of global artists.

**LeStream changes the rules.**

By combining the speed of **Yellow Network**'s state channels and the programmable liquidity of **Circle Arc**, we've built a platform where:

1.  **Users** pay strictly for what they listen to (per second) without gas fees.
2.  **Artists** get paid instantly (per second) with automated royalty splits.

---

## 🛑 The Problem

### 1. The Payment Latency Crisis
In the current music industry, there is a massive disconnect between consumption and compensation.
*   **Users** pay a monthly subscription fee (e.g., $10/month).
*   **Platforms** aggregate these fees into a giant pool.
*   **Artists** are paid out months later (often 3-6 months), based on opaque "pro-rata" models.
*   **Result**: Cash flow for artists is unpredictable.

### 2. High Transaction Costs vs. Micro-Payments
True "pay-as-you-go" streaming has been impossible because micro-transactions on-chain are infeasible.
*   A song lasts 3 minutes. Paying $0.0001 per second on Ethereum Mainnet would cost $5.00 in gas fees **per second**.
*   Even L2s, while cheaper, introduce latency (2-14 seconds) that breaks the smooth "stream-to-pay" user flow. You cannot sign a transaction for every second of audio.

---

## 💡 The Solution

**LeStream** creates a real-time, transparent value flow:

### 1. Pay-Per-Second (State Channels)
We use **Yellow Network** to open a high-speed payment channel between the listener and the platform.
*   **Deposit**: User locks 10 USDC into a smart contract vault.
*   **Stream**: Every second of audio played generates a cryptographically signed "state update" off-chain.
*   **Settle**: When the user pauses or leaves, only the **final balance** is written to the blockchain. This reduces 10,000 potential transactions to just 2 (open & close).

### 2. Instant Splits (Programmable Liquidity)
We use **Circle Arc** as a sophisticated clearing house for the platform's revenue.
*   Revenue settled from state channels is instantly routed to an Arc Developer Controlled Wallet.
*   Smart logic automatically splits payments based on **artist-defined rules**:
    *   **Custom Splits**: Artists configure their own percentages (e.g., Band: 50%, Producer: 30%, Label: 20%).
    *   **Chain Selection**: Collaborators can choose to receive funds on **any supported chain** (Base, Optimism, Mainnet, etc.), abstracting away bridging complexity.
*   This happens programmatically, ensuring funds are never "stuck" in a corporate bank account.

---

## 🏗️ Architecture

The system is composed of two primary micro-services working in unison.

```mermaid
graph TD
    subgraph "User Client (Next.js)"
        UI[Frontend UI]
        Wallet[MetaMask]
        MusicPlayer[Audio Player Component]
    end

    subgraph "Off-Chain Settlement Layer (Yellow)"
        SessionMgr[Session Server (Express)]
        YellowNode[Yellow Network Node]
        StateChannel[State Channel]
    end

    subgraph "Liquidity Layer (Circle Arc)"
        ArcAPI[Arc API Wrapper]
        USDC[USDC Payment Rails]
        Splitter[Smart Splitter Logic]
    end

    %% Flows
    UI -->|1. Sign Session| SessionMgr
    UI -->|2. Stream Audio| MusicPlayer
    MusicPlayer -->|3. Second-by-Second Signed State| SessionMgr
    SessionMgr -->|4. Final Settlement| YellowNode
    YellowNode -->|5. Settle Funds| USDC
    USDC -->|6. Trigger Split| ArcAPI
    ArcAPI -->|7. Auto-Route| Splitter
```

---

## 🧩 Core Integrations

### 1. Yellow Network Integration (Latency & Fees)

**Prize Track**: *Integrate Yellow SDK*

Yellow Network allows us to bypass the block time limitations of traditional blockchains. We implement a custom **Session Manager** (`yellow/src/server.ts`) that acts as a counterparty to the user.

*   **Technology**: Yellow Clearing Network (YCN), **Nitrolite Protocol**, State Channels.
*   **Why Yellow?**: It allows us to process thousands of transactions per second (TPS) off-chain while retaining the security guarantees of on-chain settlement found in the **Nitrolite test environment**.
*   **Implementation Details**:
    *   We utilize the **Yellow SDK** to create ephemeral "App Sessions".
    *   The user's deposit is held in a **Custody Smart Contract**.
    *   While the session is active, the balance is mutually updated off-chain via WebSocket.
    *   We track `user_balance` and `provider_balance`. Every second, `user_balance` decreases by `0.0001` and `provider_balance` increases.
    *   Upon session termination, a single transaction settles the net difference on Sepolia.

### 2. Circle Arc Integration (Liquidity & Splits)

**Prize Track**: *Best Chain Abstracted USDC Apps Using Arc as a Liquidity Hub*

Arc is the financial engine of LeStream. Once funds are settled from Yellow, they need to be distributed to the rightful owners. Traditional payment splitters (like 0xSplits) are passive; Arc allows us to be active and chain-agnostic.

*   **Technology**: Circle Arc, Developer Controlled Wallets (DCX), **Circle Gateway**.
*   **Why Arc?**: It provides a unified "Liquidity Surface". We don't need to worry about bridging or fragmentation. We can execute complex logic (splits, tax withholding, treasury management) programmatically via API.
*   **Circle Gateway**: We leverage Circle Gateway for **arbitrary message passing** and value transfer. This allows us to settle funds on Sepolia (where the State Channel closes) and instantly bridge them to Arc (or any other chain) for distribution, without the user needing to manually bridge.
*   **Implementation Details**:
    *   We use the **Arc SDK** to manage a fleet of wallets representing different stakeholders (Artist, Producer, Platform).
    *   Our `splitPayment.js` script listens for settlement events and atomically executes transfers based on the song's smart contract configuration.
    *   This ensures that artists are paid **seconds** after a listener finishes a song, not months later.
    *   **Artist Empowerment**: Creators have full control to define their revenue splits and payout destinations (Chain Agnostic), giving them financial sovereignty.
    *   We use the `checkBalance` utility to verify funds before attempting splits to avoid gas wastage.

---

## 🔬 Technical Deep Dive

### Yellow Backend API (State Channels)

Located in `yellow/src/server.ts`, this Node.js/Express server is the bridge between the frontend and the Yellow Network.

#### Endpoints

*   **`POST /session/start`**
    *   **Description**: Initializes a streaming session. Locks user funds.
    *   **Body**: 
        ```json
        { 
          "userAddress": "0x123...", 
          "depositAmount": "10.0" 
        }
        ```
    *   **Response**: 
        ```json
        { 
          "sessionId": "sess_abc123", 
          "status": "active",
          "initialBalance": "10.0"
        }
        ```

*   **`GET /session/balance`**
    *   **Description**: Returns the real-time balance of the user's active session.
    *   **Query**: `?address=0x...`
    *   **Response**: 
        ```json
        { 
          "balance": "9.998", 
          "formatted": "9.99 USD",
          "sessionStatus": "active"
        }
        ```

*   **`POST /session/play`**
    *   **Description**: Processes a micro-payment for a chunk of audio.
    *   **Body**: 
        ```json
        { 
          "sessionId": "sess_abc123", 
          "duration": 5, 
          "rate": "0.0001" 
        }
        ```
    *   **Logic**: Decrements user's off-chain balance, increments provider's balance. Returns updated balance.

*   **`POST /session/end`**
    *   **Description**: Closes the channel and triggers on-chain settlement.
    *   **Body**: `{ "sessionId": "sess_abc123" }`

    *   **Response**: `{ "txHash": "0x...", "settledAmount": "9.50" }`
    *   **Logic**:
        1.  Verifies final state signature.
        2.  Submits on-chain transaction to yellow-network-v1 contracts on Sepolia.
        3.  Triggers **`gatewayTransfer`** to bridge settled USDC from Sepolia to Arc via **Circle Gateway**.

---

### Arc Scripts (Royalty Distribution)

Located in `arc/src/`, these scripts execute the financial logic.

#### `songs.js` (Configuration)

Defines the royalty logic for the catalog. This acts as our "Rights Management Database".

```javascript
export const songs = [
  {
    id: "song_1",
    title: "Midnight Dreams",
    splits: {
      artist: 0.60, // 60%
      producer: 0.25, // 25%
      platform: 0.15 // 15%
    }
  }
]
```

#### `splitPayment.js` (Core Logic)

1.  **Input**: Takes a `totalAmount` (e.g., 100 USDC) and a `songId`.
2.  **Calculation**: Computes shares based on `songs.js`.
3.  **Execution**:
    *   Initiates parallel transactions using `circle.wallets.createTransaction`.
    *   Waits for confirmation using `circle.transactions.getTransaction`.
    *   Logs the transaction IDs for audit in `TRANSACTION_LOG.md`.

---

## 💿 Installation & Setup

### Prerequisites

*   **Node.js**: v18.17.0 or later (v20 recommended)
*   **pnpm** or **npm**: Package manager
*   **Git**: Version control
*   **Metamask**: Browser extension for EVM interactions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/LeStream.git
cd LeStream
```

### 2. Install Dependencies

We use a monorepo-style structure. You need to install dependencies in the root, and in each service directory.

```bash
# Root (Frontend)
npm install

# Yellow Backend
cd yellow
npm install
cd ..

# Arc Scripts
cd arc
npm install
cd ..
```

### 3. Environment Configuration

You will need `.env` files for each service. We have provided `.env.example` files in each directory.

#### `yellow/.env`

```ini
# Private key for the server-side relayer wallet (Testnet Only)
# This wallet must have Sepolia ETH for gas
RELAYER_PRIVATE_KEY=0x...

# RPC URL for Sepolia (Alchemy, Infura, etc.)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...

# Frontend URL for CORS (Allow requests from your Next.js app)
FRONTEND_URL=http://localhost:3000
```

#### `.env.local` (Frontend)

```ini
# URL of the Yellow Backend Service
YELLOW_BACKEND_URL=http://localhost:3001

# RPC URL for client-side reads
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
```

---

## ▶️ Running the Application

To run the full stack, you will need three terminal windows or tabs.

### Terminal 1: Yellow Backend

This starts the Express server that manages state channels.

```bash
cd yellow
npm run server:dev
```
*Output: `Server running on http://localhost:3001`*

### Terminal 2: Next.js Frontend

This starts the user interface.

```bash
npm run dev
```
*Output: `Ready in 2.5s` -> Open http://localhost:3000*

### Terminal 3: Arc Payment Simulator

Run this manually to trigger the royalty split demo when you want to simulate a payout event.

```bash
cd arc
node src/testStream.js
```
*Output: Logs showing USDC transfers to Artist/Producer wallets.*

---

## 🎬 Demo Walkthrough

Ready to test? Here is the script for a perfect demo.

1.  **Start Services**: Ensure Backend (Port 3001) and Frontend (Port 3000) are running.
2.  **Open App**: Go to `http://localhost:3000`.
3.  **Connect Wallet**: Click the top-right button to connect your MetaMask (Sepolia).
4.  **Deposit**:
    *   Click the "Stream Credits" dropdown.
    *   Enter Amount: `10.0`
    *   Click "Deposit". *Wait for the on-chain confirmation.*
    *   Observe the balance update to `10.0000 USDC`.
5.  **Stream Music**:
    *   Click "Play" on a song.
    *   Watch the "Stream Credits" balance decrease in real-time (e.g., `9.9998`, `9.9996`...).
    *   This is the **Yellow State Channel** working!
6.  **Withdraw & Settle**:
    *   Click "Withdraw".
    *   This closes the session and returns your remaining funds to your wallet.
7.  **Check Royalties (Arc)**:
    *   Check the terminal running the Arc script.
    *   You will see the revenue generated from your session being split 60/25/15.

---

## 🔧 Troubleshooting

### Common Issues

**1. "Failed to start session: Network Error"**
*   **Cause**: The Yellow Backend is not running on port 3001.
*   **Fix**: Check Terminal 1. Ensure `npm run server:dev` is running and no errors are in the logs.

**2. "Insufficient Funds for Gas"**
*   **Cause**: Your Metamask wallet (or the Relayer wallet in `.env`) has no Sepolia ETH.
*   **Fix**: Get free testnet ETH from [Alchemy Faucet](https://sepoliafaucet.com/).

**3. "CORS Error" in Browser Console**
*   **Cause**: The `FRONTEND_URL` in `yellow/.env` does not match your browser URL.
*   **Fix**: Ensure `FRONTEND_URL=http://localhost:3000`.

**4. "Arc Wallet Not Found"**
*   **Cause**: The `wallets.json` file in `arc/` is missing or has incorrect IDs.
*   **Fix**: Regenerate wallet IDs using the Circle Developer Console.

---

## 🔐 Security Considerations

*   **Private Keys**: The `RELAYER_PRIVATE_KEY` in the backend `.env` is critical. It has authority to sign state updates. In production, this should be stored in a secret manager (AWS Secrets Manager / Vault), not a file.
*   **State Channels**: We use a trusted "Relayer" model for the hackathon. In a fully decentralized version, the user would sign state updates directly in the browser, removing the need to trust the backend.
*   **Arc Wallets**: The Circle Developer Controlled Wallets are configured with spending limits to prevent draining funds if a key is compromised.

---

## 🌍 Deployment

### Vercel (Frontend)

**Live Demo**: [hack-money-2026-steel.vercel.app](https://hack-money-2026-steel.vercel.app)

1.  Push your code to GitHub.
2.  Import the project into Vercel.
3.  Set the Environment Variables in Vercel settings (`YELLOW_BACKEND_URL`, etc.).
4.  Deploy.

### DO / AWS (Backend)

The Yellow Backend requires a persistent server (it cannot run on Vercel Serverless Functions due to the WebSocket connection).
1.  Provision a droplet/EC2 instance.
2.  Install Node.js and PM2.
3.  Clone repo and run `pm2 start yellow/src/server.ts`.
4.  Set up Nginx as a reverse proxy with SSL.

---

## 🔮 Future Roadmap

### Phase 2: Decentralization
*   **P2P State Channels**: Move the `yellow/server.ts` logic into a pure browser-based client (WASM), removing the need for a trusted server intermediary.

### Phase 3: Mainnet & Scale
*   **Mainnet Deployment**: Deploy contracts to Base (for Arc).
*   **Content Encryption**: Integrate Lit Protocol to encrypt audio files so only valid session holders can decrypt the stream. This prevents "right-click saving" the music.

### Phase 4: The "Label" Killer
*   **Advances**: Allow artists to take out loans against projected streaming revenue (DeFi integration).

---

## 🤝 Contributing

We welcome contributions! Please see our contribution guidelines below.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

---

## � Feedback for Circle Arc

As part of our development process, we wanted to share some feedback on the Arc SDK experience:

### What we loved ❤️
*   **Concept**: The "Liquidity Surface" model is a huge mental unlock. Not having to think about "bridging" but just "spending" across chains is the future.
*   **Speed**: Once set up, the `transfer` and `contractExecution` APIs are blazing fast.
*   **Documentation**: The API references are comprehensive.

### Areas for Improvement 🛠️
*   **Wallet Management**: We found ourselves manually copying Wallet IDs into a `wallets.json` file. A CLI tool like `arc-cli wallets create --label "Artist"` that auto-appends to a config file would improve DX significantly.
*   **Real-time Updates**: Polling `getTransaction` status is okay for MVP, but native WebSockets or Webhooks for transaction status changes would make building real-time UIs (like our streaming player) much smoother.
*   **Testnet Faucet**: An integrated faucet within the Arc Dashboard to top up all testnet wallets at once would save time.

---

## �📄 License

Distributed under the MIT License. See `LICENSE` for more information.