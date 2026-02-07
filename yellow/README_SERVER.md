# Yellow Backend Server - Quick Start

## Overview

This backend server manages Yellow Network app sessions for the music streaming frontend. It maintains persistent WebSocket connections to Yellow Network and provides REST APIs for session management, balance queries, and song playback tracking with off-chain microtransactions.

---

## Installation

```bash
npm install
```

This installs all required dependencies including:
- `express` - HTTP server
- `cors` - Cross-origin resource sharing
- Yellow Network dependencies (@erc7824/nitrolite, viem, ws)

---

## Configuration

Ensure `yellow/.env` contains:

```bash
# Required
PRIVATE_KEY=0x...
RELAYER_PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
CLEARNODE_WS_URL=wss://clearnet-sandbox.yellow.com/ws

# Server config
YELLOW_SERVER_PORT=3001
FRONTEND_URL=http://localhost:3000
```

---

## Running the Server

### Development (with auto-reload)
```bash
npm run server:dev
```

### Production
```bash
npm run server
```

Server starts on `http://localhost:3001`

---

## API Endpoints

### Health Check
```bash
GET /health

Response:
{
  "status": "ok",
  "activeSessions": 0,
  "uptime": 123.45
}
```

### Start Session
```bash
POST /session/start
Content-Type: application/json

Body:
{
  "userAddress": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6",
  "privateKey": "0x...",
  "depositAmount": "0.01"
}

Response:
{
  "success": true,
  "sessionId": "...",
  "channelId": "0x...",
  "depositAmount": "0.010000",
  "currentBalance": "0.010000"
}
```

### Get Session Balance
```bash
GET /session/balance?address=0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6

Response (Active Session):
{
  "hasActiveSession": true,
  "sessionId": "...",
  "balance": "10000",
  "formatted": "0.0100",
  "totalSpent": "0.0000",
  "depositAmount": "0.0100"
}

Response (No Session):
{
  "hasActiveSession": false,
  "balance": "0.0000",
  "formatted": "0.0000"
}
```

### Play Song (Triggers Microtransaction)
```bash
POST /session/play
Content-Type: application/json

Body:
{
  "userAddress": "0x...",
  "song": {
    "id": "song-1",
    "songName": "Amazing Track",
    "pricePerSecond": "0.000001",
    "songFile": "...",
    "imageFile": "..."
  }
}

Response:
{
  "success": true,
  "currentBalance": "0.0099",
  "totalSpent": "0.0001"
}
```

### Stop Playing
```bash
POST /session/stop
Content-Type: application/json

Body:
{
  "userAddress": "0x..."
}

Response:
{
  "success": true,
  "playEvent": {
    "songId": "song-1",
    "durationSeconds": 5,
    "totalCost": "5000"
  },
  "currentBalance": "0.0095",
  "totalSpent": "0.0005"
}
```

### End Session
```bash
POST /session/end
Content-Type: application/json

Body:
{
  "userAddress": "0x..."
}

Response:
{
  "success": true,
  "settlement": {
    "totalSpent": "0.0005",
    "refundAmount": "0.0095",
    "listeningActivity": [
      {
        "songListened": "song-1",
        "amountSpent": "0.0005"
      }
    ]
  }
}
```

---

## Testing

### Using the Test Script

The existing test script demonstrates the full workflow:

```bash
cd yellow
npm run test:app-session
```

This runs `scripts/test-app-session-music.ts` which:
1. Deposits funds
2. Creates app session
3. Plays songs (microtransactions on each switch)
4. Closes session with refund

### Manual API Testing

**1. Start the server**:
```bash
npm run server:dev
```

**2. Test health check**:
```bash
curl http://localhost:3001/health
```

**3. Start a session** (use your test wallet):
```bash
curl -X POST http://localhost:3001/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6",
    "privateKey": "0x89dddf56c040cc0a69592543ef579dc4af03bf027a864ee18b17f89570ff51b4",
    "depositAmount": "0.01"
  }'
```

**4. Check balance**:
```bash
curl "http://localhost:3001/session/balance?address=0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6"
```

**5. Play a song** (triggers microtransaction after 5 seconds):
```bash
curl -X POST http://localhost:3001/session/play \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6",
    "song": {
      "id": "test-song-1",
      "songName": "Test Track",
      "pricePerSecond": "0.000001",
      "songFile": "test.mp3",
      "imageFile": "test.jpg"
    }
  }'

# Wait 5 seconds...

# Check balance again (should have decreased!)
curl "http://localhost:3001/session/balance?address=0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6"
```

**6. Stop playing**:
```bash
curl -X POST http://localhost:3001/session/stop \
  -H "Content-Type: application/json" \
  -d '{ "userAddress": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6" }'
```

**7. End session** (withdraws refund):
```bash
curl -X POST http://localhost:3001/session/end \
  -H "Content-Type: application/json" \
  -d '{ "userAddress": "0x14EBE0528f5ad451589Bb8667b11a6FD77F86BB6" }'
```

---

## Frontend Integration

The frontend automatically connects to this backend via `/api/yellow-session` proxy.

**Ensure both servers are running**:

**Terminal 1**:
```bash
cd yellow
npm run server:dev
```

**Terminal 2**:
```bash
cd ..
npm run dev
```

Then:
1. Open `http://localhost:3000`
2. Connect MetaMask wallet
3. **Stream Credits box** shows your balance
   - **No session**: Shows custody balance (static)
   - **Active session**: Shows session balance (live, decreasing as you play)

---

## Architecture

```
┌──────────────┐
│  Frontend    │  localhost:3000
│  Next.js App │  - StreamCredits component
└──────┬───────┘  - Auto-refreshes every 10s
       │
       ↓ /api/yellow-session
┌──────────────┐
│  Next.js API │  localhost:3000/api
│  Route       │  - Proxies to backend
└──────┬───────┘  - Falls back to custody
       │
       ↓ /session/balance
┌──────────────┐
│  This Server │  localhost:3001
│  Express     │  - Manages sessions
│  Backend     │  - Tracks allocations
└──────────────┘  - WebSocket to Yellow Network
```

---

## Session Management

### In-Memory Storage
- One `YellowService` instance per active user
- Stored in `Map<walletAddress, UserSession>`
- Auto-cleanup after 30 minutes of inactivity

### Session Lifecycle
1. **Start**: User calls `/session/start` → Creates app session, deposits funds
2. **Active**: User plays songs → Each song switch triggers microtransaction
3. **Balance queries**: Frontend polls `/session/balance` → Returns live allocations
4. **End**: User calls `/session/end` → Closes app session, withdraws refund

### Cleanup
- Every 5 minutes, server checks for inactive sessions (no activity for 30+ minutes)
- Inactive sessions are disconnected and removed

---

## Troubleshooting

### Server won't start
- Check `.env` file has all required variables
- Ensure port 3001 is not already in use
- Run `npm install` to install dependencies

### Frontend shows "0.0000 USDC"
- Ensure backend server is running (`http://localhost:3001/health`)
- Check browser console for API errors
- Verify wallet has funds in Yellow custody

### Session balance not updating
- Check backend logs for WebSocket errors
- Ensure clearnode URL is correct in `.env`
- Try restarting the backend server

### "No active session" error
- User must call `/session/start` first
- Check backend logs to see active sessions
- Use `/health` endpoint to check `activeSessions` count

---

## Production Considerations

For production deployment, consider:

1. **State Persistence**: Use Redis instead of in-memory Map
2. **Database**: Store listening history and session data
3. **WebSocket**: Add WebSocket support for real-time frontend updates
4. **Security**:
   - Use environment-specific secrets
   - Add authentication/authorization
   - Implement rate limiting
5. **Scaling**:
   - Load balancer for multiple server instances
   - Connection pooling for Yellow Network
   - Caching layer for balance queries

---

## Available Scripts

```bash
npm run server        # Run server
npm run server:dev    # Run with auto-reload (development)
npm run test:app-session  # Run full app session test
npm run cleanup       # Close all channels and withdraw custody
```

---

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Review Yellow Network clearnode status
3. Test with the included test script first
4. Verify all environment variables are set correctly
