# Deposit & Withdraw Feature - Yellow Network App Sessions

## ✅ Implementation Complete

Users can now deposit funds and start Yellow Network app sessions directly from the frontend UI!

---

## 🎯 Features

### Stream Credits Dropdown

**Location**: Top-left corner of main page

**UI Enhancements**:
- ✅ Clickable dropdown with chevron indicator
- ✅ Amount input field (USDC with 4 decimal precision)
- ✅ Private key input field (for testnet)
- ✅ Deposit button (green) - Starts session + deposits funds
- ✅ Withdraw button (red) - Ends session + withdraws funds
- ✅ Loading states with spinners
- ✅ Success/error message display
- ✅ Warning banner about testnet usage

---

## 🔄 User Flow

### Deposit & Start Session

```
1. User clicks "Stream Credits" box
   └─ Dropdown expands showing inputs

2. User enters deposit amount (e.g., "0.01")
   └─ Amount in USDC

3. User enters their private key (0x...)
   ⚠️ Testnet only! Never use production keys

4. User clicks "Deposit" button
   └─ Frontend validates inputs
   └─ Calls /api/yellow/deposit
   └─ API calls Yellow backend /session/start
   └─ Backend:
       a. Creates YellowService instance for user
       b. Connects to Yellow Network clearnode
       c. Deposits to custody contract (on-chain tx)
       d. Creates app session with user + relayer
       e. Returns session info

5. Success!
   └─ Balance updates from custody → session balance
   └─ User can now stream music with micropayments
```

### Withdraw & End Session

```
1. User clicks "Withdraw" button
   └─ Frontend calls /api/yellow/withdraw
   └─ API calls Yellow backend /session/end
   └─ Backend:
       a. Stops any active playback
       b. Closes app session with final allocations
       c. Withdraws refund to user's wallet (on-chain tx)
       d. Sends payment to relayer custody
       e. Returns settlement info

2. Success!
   └─ Balance updates from session → custody
   └─ User receives refund in wallet
   └─ Listening activity saved for artist payouts
```

---

## 📊 App Session Details

### Participants

**1. User** (wallet connected to MetaMask)
- Deposits initial funds
- Signs transactions for deposit and app session creation
- Balance decreases as songs are played (off-chain microtransactions)
- Receives refund when session ends

**2. Relayer** (backend server with RELAYER_PRIVATE_KEY)
- Starts with 0 balance
- Balance increases as songs are played (receives micropayments)
- Receives final payment when session ends
- Distributes payments to artists

### Example Session

```
Initial State (after deposit):
┌────────────┬──────────┬─────────────┐
│ Participant│ Balance  │ Change      │
├────────────┼──────────┼─────────────┤
│ User       │ 0.0100   │ Deposited   │
│ Relayer    │ 0.0000   │ Initial     │
└────────────┴──────────┴─────────────┘

After Playing Song 1 (5 seconds @ 0.000001/sec):
┌────────────┬──────────┬─────────────┐
│ Participant│ Balance  │ Change      │
├────────────┼──────────┼─────────────┤
│ User       │ 0.009995 │ -0.000005   │
│ Relayer    │ 0.000005 │ +0.000005   │
└────────────┴──────────┴─────────────┘

After Playing Song 2 (10 seconds @ 0.000002/sec):
┌────────────┬──────────┬─────────────┐
│ Participant│ Balance  │ Change      │
├────────────┼──────────┼─────────────┤
│ User       │ 0.009975 │ -0.000020   │
│ Relayer    │ 0.000025 │ +0.000020   │
└────────────┴──────────┴─────────────┘

Final State (after withdraw):
┌────────────┬──────────┬─────────────┐
│ Participant│ Balance  │ Status      │
├────────────┼──────────┼─────────────┤
│ User       │ 0.009975 │ In Wallet   │
│ Relayer    │ 0.000025 │ In Custody  │
└────────────┴──────────┴─────────────┘
```

**Key Point**: All song payments are **off-chain** (no gas fees!). Only deposit and withdraw are on-chain.

---

## 🗂️ Implementation Files

### Frontend

**[components/StreamCredits.tsx](components/StreamCredits.tsx)**
- Dropdown UI with amount + private key inputs
- Deposit handler: Validates inputs, calls `/api/yellow/deposit`
- Withdraw handler: Calls `/api/yellow/withdraw`
- Real-time balance display (auto-refresh every 10s)
- Success/error message handling

### API Routes

**[app/api/yellow/deposit/route.ts](app/api/yellow/deposit/route.ts)**
```typescript
POST /api/yellow/deposit
Body: { userAddress, privateKey, depositAmount }

Flow:
1. Validate inputs (address, private key, amount)
2. Call Yellow backend: POST /session/start
3. Return session info or error
```

**[app/api/yellow/withdraw/route.ts](app/api/yellow/withdraw/route.ts)**
```typescript
POST /api/yellow/withdraw
Body: { userAddress }

Flow:
1. Validate address
2. Call Yellow backend: POST /session/end
3. Return settlement info or error
```

### Backend Server

**[yellow/src/server.ts](yellow/src/server.ts)**
- Manages Yellow service instances per user
- Endpoint: `POST /session/start` - Creates session with deposit
- Endpoint: `POST /session/end` - Closes session with refund
- In-memory session storage (one YellowService per active user)

---

## 🔐 Security Considerations

### ⚠️ TESTNET ONLY Implementation

**Current approach** (for testing/development):
- User enters private key in UI
- Private key sent to backend over HTTPS
- Backend creates Yellow service and signs transactions

**Why this is TESTNET ONLY**:
- ❌ Private keys should never be entered in web forms
- ❌ Private keys should never be sent over HTTP (even HTTPS)
- ❌ Compromised keys = lost funds

### 🔒 Production-Ready Approach

For production, implement:
1. **MetaMask Integration**:
   - User signs transactions with MetaMask (private key never exposed)
   - Use viem `createWalletClient` with MetaMask provider
   - Frontend calls wallet methods for signing

2. **WalletConnect/Web3Modal**:
   - Support multiple wallet providers
   - Mobile wallet support
   - Better UX for wallet interactions

3. **Server-Side Session Management**:
   - Backend holds only relayer private key
   - User signs all their transactions client-side
   - Backend co-signs app session operations as relayer

---

## 🧪 Testing

### Prerequisites

1. **Start Yellow Backend Server**:
```bash
cd yellow
npm install  # Install express + cors if not done
npm run server:dev
```

**Output**:
```
Yellow Network Backend Server
Server running on http://localhost:3001
```

2. **Start Frontend**:
```bash
npm run dev
```

### Test Flow

1. **Connect Wallet**:
   - Click "Connect Wallet" in top-right
   - Connect MetaMask
   - Ensure you're on Sepolia testnet

2. **Check Initial Balance**:
   - Look at "Stream Credits" box
   - Shows custody balance (likely 0.0000 initially)

3. **Deposit Funds**:
   - Click "Stream Credits" to expand dropdown
   - Enter amount: `0.01`
   - Enter your testnet private key (⚠️ testnet only!)
   - Click "Deposit"
   - Wait for transaction (~10-30 seconds)
   - Success message appears
   - Balance updates to show session balance

4. **Verify Active Session**:
   - Balance now shows funds from active app session
   - Backend logs show session created
   - Check `/session/balance` endpoint:
```bash
curl "http://localhost:3001/session/balance?address=YOUR_ADDRESS"
```

5. **Withdraw Funds**:
   - Click "Withdraw" button
   - Wait for transaction (~10-30 seconds)
   - Success message shows refund amount
   - Balance updates to show custody balance
   - Funds returned to wallet

### Manual API Testing

```bash
# 1. Start backend
cd yellow && npm run server:dev

# 2. Test deposit/session start
curl -X POST http://localhost:3001/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0xYOUR_ADDRESS",
    "privateKey": "0xYOUR_TESTNET_PRIVATE_KEY",
    "depositAmount": "0.01"
  }'

# 3. Check session balance
curl "http://localhost:3001/session/balance?address=0xYOUR_ADDRESS"

# 4. End session/withdraw
curl -X POST http://localhost:3001/session/end \
  -H "Content-Type: application/json" \
  -d '{ "userAddress": "0xYOUR_ADDRESS" }'
```

---

## 📝 Environment Variables

### `.env.local` (frontend)
```bash
YELLOW_BACKEND_URL=http://localhost:3001
RELAYER_PRIVATE_KEY=0x...  # Relayer key (backend only)
```

### `yellow/.env` (backend)
```bash
RELAYER_PRIVATE_KEY=0x...  # Same as above
YELLOW_SERVER_PORT=3001
FRONTEND_URL=http://localhost:3000
```

---

## 🚀 Next Steps

### Phase 1: Music Player Integration
- Call `/session/play` when song starts
- Call `/session/stop` when song ends
- Balance decreases automatically as songs play
- Show per-song costs in UI

### Phase 2: Production Security
- Replace private key input with MetaMask signing
- Implement proper wallet connection flow
- Add transaction confirmation UI
- Support multiple wallet providers

### Phase 3: Enhanced UX
- Show transaction status (pending/confirmed)
- Display gas estimates
- Add transaction history
- Show listening activity breakdown

---

## 🐛 Troubleshooting

### "Please enter a valid private key"
- Ensure private key starts with `0x`
- Must be exactly 66 characters (0x + 64 hex digits)
- Use your testnet wallet's private key

### "Failed to start session"
- Check Yellow backend is running (`http://localhost:3001/health`)
- Verify you have Sepolia ETH for gas fees
- Check backend logs for detailed error messages
- Ensure custody contract has enough USDC allowance

### "Deposit failed"
- Verify wallet has sufficient USDC balance
- Check Sepolia RPC endpoint is accessible
- Ensure Yellow Network clearnode is online
- Try smaller deposit amount

### Balance not updating
- Wait 10 seconds for auto-refresh
- Click Stream Credits to collapse/expand dropdown
- Check browser console for errors
- Verify backend `/session/balance` returns correct data

---

## ✨ Summary

The deposit/withdraw feature allows users to:
- ✅ Start Yellow Network app sessions from the frontend
- ✅ Deposit funds to custody contract
- ✅ See real-time session balance (updates as songs play)
- ✅ Withdraw refunds when session ends
- ✅ All with a simple dropdown UI

**App session benefits**:
- 🚀 Off-chain micropayments (no gas per song!)
- 💰 Automatic fund distribution (user refund + relayer payment)
- 📊 Listening activity tracking for artist payouts
- ⚡ Real-time balance updates

**Ready for music player integration!** When users play songs, their balance will decrease in real-time as micropayments flow to the relayer.
