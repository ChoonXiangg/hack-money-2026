# Stream Credits - Yellow Network Integration

## ✅ Implementation Complete

The Stream Credits feature now displays the user's actual **Yellow Network custody balance** instead of a placeholder.

---

## 🔧 What Was Implemented

### 1. **New API Route**: `/api/yellow-balance`
**File**: [`app/api/yellow-balance/route.ts`](app/api/yellow-balance/route.ts)

**Purpose**: Fetches the user's Yellow Network custody balance from the Sepolia custody contract.

**Endpoint**:
```
GET /api/yellow-balance?address=0x...
```

**Response**:
```json
{
  "address": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6",
  "custodyBalance": "10000",
  "formatted": "0.010000",
  "decimals": 6,
  "token": "ytest.usd"
}
```

**Technical Details**:
- Reads from Yellow Network Custody Contract: `0x019B65A265EB3363822f2752141b3dF16131b262`
- Token: `ytest.usd` (Yellow testnet USDC): `0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb`
- Uses `getAccountsBalances(address[], address[])` function
- Network: Sepolia testnet
- RPC: Alchemy (with public fallback)

---

### 2. **Updated Component**: `StreamCredits`
**File**: [`components/StreamCredits.tsx`](components/StreamCredits.tsx)

**Features**:
- ✅ Fetches real custody balance from Yellow Network
- ✅ Auto-refreshes every 10 seconds
- ✅ Listens for wallet connection/disconnect events
- ✅ Shows loading spinner while fetching
- ✅ Error handling with red text on failure
- ✅ Displays balance formatted to 4 decimal places

**Behavior**:
1. On mount: Checks localStorage for `walletAddress`
2. If connected: Fetches Yellow custody balance
3. If disconnected: Shows `0.00 USDC`
4. Updates automatically when wallet changes
5. Polls for updates every 10 seconds

---

## 🎯 How It Works

### User Flow:
```
1. User connects MetaMask wallet
   └─ ConnectWallet saves address to localStorage
   └─ Triggers "walletChanged" event

2. StreamCredits detects wallet change
   └─ Calls /api/yellow-balance?address=0x...
   └─ API reads custody contract on Sepolia
   └─ Returns formatted balance

3. Component displays: "Stream Credits 0.0100 USDC"

4. Auto-refresh every 10 seconds
   └─ Keeps balance up-to-date
   └─ Useful after deposits/withdrawals
```

---

## 🔗 Yellow Network Integration

### Custody Contract Reading
The API uses the same method as the Yellow service backend:

```typescript
// Read custody balance directly from contract
const balances = await publicClient.readContract({
  address: CUSTODY_ADDRESS,
  abi: CUSTODY_ABI,
  functionName: "getAccountsBalances",
  args: [[userAddress], [tokenAddress]],
});
```

This is the **read-only** version - no private key needed, just reads public contract state.

---

## 📊 Display Format

| Raw Balance (wei) | Formatted (USDC) | Display |
|-------------------|------------------|---------|
| `0` | `0.000000` | `0.0000 USDC` |
| `10000` | `0.010000` | `0.0100 USDC` |
| `1000000` | `1.000000` | `1.0000 USDC` |
| `1500000` | `1.500000` | `1.5000 USDC` |

- Token has **6 decimals** (same as USDC)
- Display shows **4 decimal places** for better precision
- Full precision available in API response

---

## 🧪 Testing

### Test the API:
```bash
# Replace with your connected wallet address
curl "http://localhost:3000/api/yellow-balance?address=0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6"
```

### Test the Component:
1. Start the dev server: `npm run dev`
2. Connect your MetaMask wallet
3. Check the "Stream Credits" box in the header
4. Should display your actual Yellow Network custody balance

### Test Auto-Refresh:
1. Deposit funds to Yellow custody (using the yellow backend)
2. Wait up to 10 seconds
3. Watch the Stream Credits box update automatically

---

## 🔐 Security Notes

- ✅ **Read-only**: API only reads public contract state
- ✅ **No private keys**: Uses publicClient, not walletClient
- ✅ **Address validation**: Checks address format before query
- ✅ **Error handling**: Graceful fallback to "0.00" on errors
- ✅ **Rate limiting**: Auto-refresh limited to 10-second intervals

---

## 📝 Environment Variables

Added to [`.env.local`](.env.local):
```bash
# Yellow Network - Sepolia RPC
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/2MWb1DKddw68ziKmzuY6r
```

Falls back to public RPC if not set: `https://1rpc.io/sepolia`

---

## 🚀 Next Steps (Future Enhancements)

### Potential Additions:
1. **Deposit Button**: Allow users to deposit USDC to custody directly from UI
2. **Withdraw Button**: Withdraw custody funds back to wallet
3. **Transaction History**: Show recent custody deposits/withdrawals
4. **App Session Integration**: Create/manage streaming sessions from frontend
5. **Real-time Updates**: Use WebSocket instead of polling for instant updates

---

## 📌 Key Files Modified

| File | Purpose |
|------|---------|
| [`app/api/yellow-balance/route.ts`](app/api/yellow-balance/route.ts) | New API endpoint for custody balance |
| [`components/StreamCredits.tsx`](components/StreamCredits.tsx) | Updated component with real data |
| [`.env.local`](.env.local) | Added ALCHEMY_RPC_URL |

---

## ✨ Result

The **Stream Credits** box now shows your actual Yellow Network custody balance in real-time! 🎉

Users can see how much USDC they have available for streaming micropayments on the Yellow Network.
