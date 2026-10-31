# Ludo X BD - Real-time Online Multiplayer Server 🎮🇧🇩

Official real-time WebSocket server for **Ludo X BD**. Handles room matchmaking, custom 6-digit private rooms, synchronized turns, dice rolls, token moves, turn timers (15s AFK protection), and live emoji reactions.

---

## 🚀 How to Run Locally

### Option 1: Java Server (Zero-Dependency, Instant Run)
If you have Java installed on your computer, compile and start the server:
```bash
# From workspace root:
javac server/LudoServer.java
java -cp server server.LudoServer
```
*Server runs on:* `ws://localhost:3000` (or `http://localhost:3000/health`)

---

### Option 2: Node.js Server
If you have Node.js installed:
```bash
cd server
npm start
# or: node server.js
```
*Server runs on:* `ws://localhost:3000`

---

## 🌐 Free Cloud Deployment (Online Internet Multiplayer)

To allow players around Bangladesh and the world to play together over mobile data or Wi-Fi without sharing the same local router, deploy this server to any free Node.js hosting platform:

### 1. Render.com (Recommended Free Hosting)
1. Go to [Render.com](https://render.com) and create a free account.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (or upload the `server` folder).
4. Set:
   - **Root Directory:** `server`
   - **Environment:** `Node`
   - **Build Command:** `npm install` (or leave empty)
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Click **Create Web Service**.
6. Render will generate a live URL like: `https://ludo-x-bd-server.onrender.com`.
7. In the game Settings, configure the WebSocket URL to:
   `wss://ludo-x-bd-server.onrender.com`

---

### 2. Railway.app / Fly.io / VPS
- Deploy with port `3000` (or standard `$PORT` environment variable).
- Use `wss://` (secure WebSocket) for production builds.

---

## 📡 WebSocket API Protocol Summary

| Message Type | Direction | Payload | Description |
|---|---|---|---|
| `CONNECTED` | Server -> Client | `{ clientId, serverTime }` | Confirms WebSocket handshake |
| `QUICK_MATCH` | Client -> Server | `{ targetCount: 2 \| 4 }` | Enters random matchmaking queue |
| `MATCH_STARTED` | Server -> Client | `{ roomCode, players, startingTurn }` | Match found, begins board gameplay |
| `CREATE_ROOM` | Client -> Server | `{ maxPlayers: 4 }` | Generates a 6-digit room code |
| `JOIN_ROOM` | Client -> Server | `{ roomCode }` | Joins private room with code |
| `ROLL_DICE` | Client -> Server | `{}` | Requests server-authoritative dice roll |
| `DICE_ROLLED` | Server -> Client | `{ color, roll, isSix }` | Synchronizes 3D dice roll |
| `MOVE_TOKEN` | Client -> Server | `{ tokenId }` | Requests token move |
| `TOKEN_MOVED` | Server -> Client | `{ color, tokenId, diceValue }` | Synchronizes token hopping on all screens |
| `SEND_EMOTE` | Client -> Server | `{ emoji: '🔥' }` | Broadcasts floating emoji to all players |
| `TURN_CHANGED`| Server -> Client | `{ nextTurn: 'red' }` | Switches active turn |
| `TURN_TIMEOUT`| Server -> Client | `{ timedOutColor }` | Triggers AFK bot skip if player inactive |
