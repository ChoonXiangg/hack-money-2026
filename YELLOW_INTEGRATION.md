# Yellow Network Integration - Stream Credits with App Sessions

## ✅ Complete Implementation

The Stream Credits feature now displays the user's **real-time balance from active Yellow Network app sessions**, falling back to custody balance when no session is active.

---

## 🏗️ Architecture

### Three-Tier System

```
┌─────────────────┐
│   Frontend      │  Next.js App (localhost:3000)
│   StreamCredits │  - Displays live balance
└────────┬────────┘  - Auto-refreshes every 10s
         │
         ↓ HTTP GET /api/yellow-session
┌─────────────────┐
│   Next.js API   │  API Route (localhost:3000)
│   /api/yellow-  │  - Checks backend for session
│   session        │  - Falls back to custody contract
└────────┬────────┘
         │
         ↓ HTTP GET /session/balance
┌─────────────────┐
│   Yellow        │  Express Server (localhost:3001)
│   Backend       │  - Maintains WebSocket to Yellow Network
│   Server        │  - Manages app sessions per user
└─────────────────┘  - Tracks allocations & microtransactions
```

---

## 📁 Implementation Files

### Backend Server
**File**: [`yellow/src/server.ts`](yellow/src/server.ts)

**Purpose**: Persistent backend that manages Yellow Network app sessions

**Key Features**:
- Express REST API
- In-memory session management (one YellowService per active user)
- WebSocket connection to Yellow Network clearnode
- Auto-cleanup of inactive sessions (30-minute timeout)

**Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/session/start` | POST | Start streaming session with deposit |
| `/session/balance` | GET | Get user's current session balance |
| `/session/play` | POST | Start playing song (triggers microtransaction) |
| `/session/stop` | POST | Stop playing song |
| `/session/end` | POST | End session and withdraw refund |

**Example Session Flow**:
```typescript
// 1. Start session
POST /session/start
Body: { userAddress, privateKey, depositAmount: "0.01" }
→ Creates app session, deposits funds

// 2. Check balance
GET /session/balance?address=0x...
→ { hasActiveSession: true, formatted: "0.0100", ... }

// 3. Play song
POST /session/play
Body: { userAddress, song: { id, songName, pricePerSecond, ... } }
→ Triggers microtransaction, updates allocations

// 4. Check balance again
GET /session/balance?address=0x...
→ { hasActiveSession: true, formatted: "0.0098", ... } // decreased!

// 5. End session
POST /session/end
Body: { userAddress }
→ Closes app session, withdraws refund
```

---

### Frontend API Route
**File**: [`app/api/yellow-session/route.ts`](app/api/yellow-session/route.ts)

**Purpose**: Proxy between frontend and Yellow backend

**Logic**:
1. Try to fetch session balance from backend server
2. If session exists and is active → return session balance
3. If no session or backend unavailable → return custody balance

**Response**:
```json
{
  "address": "0x...",
  "balance": "10000",
  "formatted": "0.0100",
  "decimals": 6,
  "token": "ytest.usd",
  "hasActiveSession": true,
  "source": "session" // or "custody"
}
```

---

### Frontend Component
**File**: [`components/StreamCredits.tsx`](components/StreamCredits.tsx)

**Changes**:
- Now fetches from `/api/yellow-session` instead of `/api/yellow-balance`
- Displays **session balance** when user has active session
- Falls back to **custody balance** when no session active
- Auto-refreshes every 10 seconds
- Shows loading spinner and error states

---

## 🔧 Setup & Usage

### 1. Install Dependencies

```bash
cd yellow
npm install
# Installs: express, cors, @types/express, @types/cors
```

### 2. Configure Environment

**yellow/.env**:
```bash
# Existing config...
RELAYER_PRIVATE_KEY=0x...

# New: Backend server
YELLOW_SERVER_PORT=3001
FRONTEND_URL=http://localhost:3000
```

**.env.local** (root):
```bash
# Existing config...
ALCHEMY_RPC_URL=...

# New: Backend URL
YELLOW_BACKEND_URL=http://localhost:3001
```

### 3. Start Services

**Terminal 1 - Yellow Backend Server**:
```bash
cd yellow
npm run server:dev  # or npm run server
```

**Terminal 2 - Next.js Frontend**:
```bash
npm run dev
```

### 4. Test the Integration

#### Option A: Manual Testing via API

```bash
# 1. Start a session (replace with actual private key)
curl -X POST http://localhost:3001/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6",
    "privateKey": "0x...",
    "depositAmount": "0.01"
  }'

# 2. Check session balance
curl "http://localhost:3001/session/balance?address=0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6"

# 3. Check via frontend API
curl "http://localhost:3000/api/yellow-session?address=0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6"
```

#### Option B: Frontend UI Testing

1. Start both servers (backend + frontend)
2. Open `http://localhost:3000`
3. Connect MetaMask wallet
4. **Stream Credits box shows custody balance** (no active session yet)
5. [Future: When music player integrated] Start playing music
6. **Stream Credits updates to show session balance** (decreases as you play)
7. [Future] Stop playing → balance stops decreasing
8. [Future] End session → balance updates to show refund in custody

---

## 🔄 How It Works

### Scenario 1: No Active Session
```
User → Frontend → API Route → Backend (no session) → Custody Contract
                      ↓
                Returns custody balance (static)
```

### Scenario 2: Active Session
```
User → Frontend → API Route → Backend (active session) → Session allocations
                      ↓
                Returns session balance (live, decreasing)
```

### Microtransaction Flow
```
1. User plays Song A for 2 seconds
   - User allocation: 10000 (0.01 USDC)
   - Relayer allocation: 0

2. User switches to Song B
   → Microtransaction triggered (off-chain!)
   - User allocation: 9998 (0.009998 USDC)  // decreased
   - Relayer allocation: 2 (0.000002 USDC)  // increased
   - Frontend sees updated balance in Stream Credits

3. User plays Song B for 3 seconds, switches to Song C
   → Another microtransaction
   - User allocation: 9995 (0.009995 USDC)  // decreased more
   - Relayer allocation: 5 (0.000005 USDC)  // increased more

4. User ends session
   → Close app session, final settlement
   - User refund: 9995 units → withdrawn to wallet
   - Relayer payment: 5 units → stays in relayer custody
   - ListeningActivity sent to relayer for artist distribution
```

**Key Benefit**: All song payments are **off-chain** (no gas per song!)

---

## 🎯 Current State vs Future

### ✅ Currently Implemented
- Backend server with session management
- Frontend displays live session balance OR custody balance
- API integration between all layers
- Auto-refresh every 10 seconds

### 🔄 To Be Implemented (Music Player Integration)
- **Start session** when user clicks "Play" for first time
- **Play/stop song** endpoints called by music player
- **Session state UI** showing active session status
- **End session** button to withdraw refund
- **Listening history** display with per-song breakdown

---

## 📊 Data Flow Example

### Initial State (No Session)
```
StreamCredits Component:
  → Fetches /api/yellow-session?address=0x...
  → API checks backend (no session)
  → API reads custody contract
  → Returns: { formatted: "0.0100", source: "custody" }
  → Display: "Stream Credits 0.0100 USDC"
```

### After Starting Session
```
StreamCredits Component:
  → Fetches /api/yellow-session?address=0x...
  → API checks backend (session exists!)
  → Backend returns: { formatted: "0.0100", hasActiveSession: true }
  → Display: "Stream Credits 0.0100 USDC" (from session)
```

### After Playing Songs
```
StreamCredits Component (auto-refresh):
  → Fetches /api/yellow-session?address=0x...
  → Backend returns: { formatted: "0.0095", hasActiveSession: true }
  → Display: "Stream Credits 0.0095 USDC" (decreased!)
```

---

## 🔐 Security Considerations

### Backend Server
- ✅ **Server-side private key storage** (never exposed to frontend)
- ✅ **CORS restricted** to frontend URL only
- ✅ **Session isolation** per user address
- ✅ **Auto-cleanup** of stale sessions
- ⚠️ **In-memory sessions** (use Redis for production scaling)

### Frontend
- ✅ **No private keys** in frontend code
- ✅ **Read-only balance queries**
- ✅ **MetaMask signing** for user wallet interactions

### API Routes
- ✅ **Input validation** (address format checks)
- ✅ **Graceful fallbacks** (backend unavailable → custody balance)
- ✅ **Error handling** throughout

---

## 🚀 Next Steps

### Phase 1: Complete Music Player Integration
1. **Session Management UI**
   - "Start Session" button with deposit input
   - "End Session" button with refund display
   - Active session indicator

2. **Music Player Hooks**
   - Call `/session/play` when song starts
   - Call `/session/stop` when song ends
   - Auto-start session if not active

3. **Listening Activity Display**
   - Show per-song costs in real-time
   - Display artist payment breakdown
   - Show total spent vs remaining

### Phase 2: Production Readiness
1. **State Persistence**
   - Redis for session storage
   - Database for listening history
   - Webhook for balance updates

2. **WebSocket for Real-time**
   - Replace polling with WebSocket
   - Instant balance updates on song switch
   - Live session status notifications

3. **Multi-User Scaling**
   - Connection pooling
   - Rate limiting
   - Load balancing

---

## 📝 Environment Variables Summary

### yellow/.env
```bash
PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
CLEARNODE_WS_URL=wss://clearnet-sandbox.yellow.com/ws
RELAYER_PRIVATE_KEY=0x...
YELLOW_SERVER_PORT=3001
FRONTEND_URL=http://localhost:3000
```

### .env.local (root)
```bash
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
YELLOW_BACKEND_URL=http://localhost:3001
```

---

## ✨ Result

The **Stream Credits** box now shows:
- **Live session balance** when user is actively streaming (decreases as songs play)
- **Custody balance** when no session is active (static)
- **Auto-updates every 10 seconds** to reflect microtransactions
- **4 decimal precision** for accurate USDC display

🎉 **Ready for music player integration!** The backend infrastructure is complete and waiting for the frontend music player to start making session/play/stop API calls.
