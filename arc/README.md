# Arc Music Streaming - Instant Royalty Splits

A hackathon project demonstrating real-time, multi-party royalty distribution for music streaming using Circle's Developer Controlled Wallets on Arc Testnet.

## What It Does

When a user streams a song, payment is **instantly split** between multiple parties (Artist, Producer, Platform) based on configurable percentages - all on-chain, in real-time.

## Key Features

- **Per-second pricing** - Songs have individual rates (e.g., 0.0001 USDC/sec)
- **Configurable splits** - Each song can have different royalty percentages
- **Instant settlement** - Payments split immediately via on-chain transactions
- **Multi-party support** - Artist, Producer, Platform, or any number of recipients

## Quick Demo

```bash
# Install dependencies
npm install

# Stream a song (60 seconds)
node src/testStream.js

# Stream Song #2 with different splits
node src/testStream2.js

# Check any wallet balance
node src/checkBalance.js <wallet-id>
```

## Example Output

```
=== Streaming: "Electric Sunrise" ===
Duration: 60 seconds
Price per second: 0.00015 USDC
Total cost: 0.009000 USDC

Sending 0.005400 USDC (60%) to Artist
Sending 0.002250 USDC (25%) to Producer
Sending 0.001350 USDC (15%) to Platform
```

## Song Catalog

| Song | Price/sec | Artist | Producer | Platform |
|------|-----------|--------|----------|----------|
| Midnight Dreams | 0.0001 USDC | 50% | 30% | 20% |
| Electric Sunrise | 0.00015 USDC | 60% | 25% | 15% |
| Ocean Waves | 0.00008 USDC | 70% | - | 30% |

## Technical Stack

- **Blockchain:** Arc Testnet (Circle)
- **Token:** USDC (native on Arc)
- **SDK:** `@circle-fin/developer-controlled-wallets`
- **Runtime:** Node.js (ES Modules)

## Wallet Addresses

| Role | Address |
|------|---------|
| Listener | `0x843b9ec5c49092bbf874acbacb397d2c252e36a4` |
| Artist | `0xda29bf5e13cc0a808baa3a435f4e3fbfece8bb6f` |
| Producer | `0x0f19f1f7e413af44b79e30c1cc4a07a25f4eee03` |
| Platform | `0x96244711f04a3899cf5c3b1e727409e1856d6874` |

## Project Structure

```
arc/
├── src/
│   ├── index.js          # Module exports
│   ├── stream.js         # payForStream(songId, seconds)
│   ├── splitPayment.js   # Core split payment logic
│   ├── songs.js          # Song catalog with splits
│   ├── checkBalance.js   # Balance checker utility
│   ├── testStream.js     # Demo: Song #1
│   └── testStream2.js    # Demo: Song #2
├── wallets.json          # Wallet IDs and addresses
├── TRANSACTION_LOG.md    # All transaction history
└── README.md
```

## Usage as Module

```javascript
import { payForStream, listSongs } from "./src/index.js";

// List available songs
const songs = listSongs();

// Stream a song for 120 seconds
const result = await payForStream("song-001", 120);
console.log(result.transactions); // Array of tx IDs
```

## Built For

Hack Money 2026 - Demonstrating instant, transparent royalty distribution using Circle's programmable wallets.
