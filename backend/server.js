// Ludo X BD - High-Performance Authoritative Real-Time Node.js Server
// Zero external dependencies - Runs natively with pure Node.js v16+

const http = require('http');
const crypto = require('crypto');
const RoomManager = require('./core/room_manager');
const CryptoRNG = require('./core/crypto_rng');

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();
const clients = new Map(); // clientId -> ClientSession

class ClientSession {
    constructor(id, socket) {
        this.id = id;
        this.socket = socket;
        this.name = 'খেলোয়াড়';
        this.avatar = 'king';
        this.color = 'red';
        this.lobby = null;
        this.room = null;
        this.isClosed = false;

        const cleanupSession = (reason) => {
            if (this.isClosed) return;
            this.isClosed = true;
            roomManager.handleDisconnect(this);
            clients.delete(this.id);
            console.log(`[Disconnect] Client ${this.id} disconnected (${reason}). (Active: ${clients.size})`);
        };

        this.socket.on('close', () => {
            cleanupSession('close');
        });

        this.socket.on('end', () => {
            cleanupSession('end');
        });

        this.socket.on('error', (err) => {
            cleanupSession(`error: ${err.message}`);
        });
    }

    send(type, payload = {}) {
        if (this.isClosed || !this.socket.writable) return;
        try {
            const data = JSON.stringify({ type, payload });
            const payloadBuf = Buffer.from(data, 'utf8');
            const len = payloadBuf.length;

            let header;
            if (len < 126) {
                header = Buffer.alloc(2);
                header[0] = 0x81; // Text frame, FIN
                header[1] = len;
            } else if (len <= 65535) {
                header = Buffer.alloc(4);
                header[0] = 0x81;
                header[1] = 126;
                header.writeUInt16BE(len, 2);
            } else {
                header = Buffer.alloc(10);
                header[0] = 0x81;
                header[1] = 127;
                header.writeBigUInt64BE(BigInt(len), 2);
            }

            this.socket.write(Buffer.concat([header, payloadBuf]));
        } catch (e) {
            console.error(`[Send Error] Failed to send to ${this.id}:`, e.message);
        }
    }
}

// HTTP Server & Health Endpoint
const server = http.createServer((req, res) => {
    // Enable CORS for web clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            engine: 'Ludo X BD Authoritative Node.js Server',
            port: PORT,
            activeClients: clients.size,
            publicLobbies: roomManager.publicLobbies.size,
            privateLobbies: roomManager.privateLobbies.size,
            activeGameRooms: roomManager.activeGameRooms.size,
            uptimeSeconds: Math.floor(process.uptime())
        }));
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

// RFC 6455 WebSocket Upgrade Handler
server.on('upgrade', (req, socket, head) => {
    const wsKey = req.headers['sec-websocket-key'];
    if (!wsKey) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto.createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
    ];

    socket.write(headers.join('\r\n'));

    const clientId = CryptoRNG.generateClientId();
    const client = new ClientSession(clientId, socket);
    clients.set(clientId, client);
    console.log(`[Connect] Client connected: ${clientId} (Total: ${clients.size})`);

    // Greet client & send board list
    client.send('CONNECTED', { clientId: clientId });
    client.send('BOARD_LIST', { boards: roomManager.getBoardList() });

    // Stream frame parser
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 2) {
            const b1 = buffer[0];
            const b2 = buffer[1];
            const opcode = b1 & 0x0F;
            const isMasked = (b2 & 0x80) !== 0;
            let payloadLen = b2 & 0x7F;
            let offset = 2;

            if (payloadLen === 126) {
                if (buffer.length < 4) break;
                payloadLen = buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (buffer.length < 10) break;
                payloadLen = Number(buffer.readBigUInt64BE(2));
                offset = 10;
            }

            let mask = null;
            if (isMasked) {
                if (buffer.length < offset + 4) break;
                mask = buffer.slice(offset, offset + 4);
                offset += 4;
            }

            if (buffer.length < offset + payloadLen) break;

            const payloadBuf = buffer.slice(offset, offset + payloadLen);
            buffer = buffer.slice(offset + payloadLen);

            if (isMasked && mask) {
                for (let i = 0; i < payloadBuf.length; i++) {
                    payloadBuf[i] ^= mask[i % 4];
                }
            }

            // Opcode handling
            if (opcode === 0x08) {
                // Close frame
                socket.end();
                break;
            } else if (opcode === 0x09) {
                // Ping -> Send Pong
                const pong = Buffer.from([0x8A, 0x00]);
                socket.write(pong);
            } else if (opcode === 0x01) {
                // Text frame
                const text = payloadBuf.toString('utf8');
                try {
                    const packet = JSON.parse(text);
                    processMessage(client, packet);
                } catch (e) {
                    console.warn(`[JSON Parse Error] From ${client.id}:`, e.message);
                }
            }
        }
    });
});

function processMessage(client, packet) {
    const { type, payload = {} } = packet;

    switch (type) {
        case 'SET_PROFILE':
            if (payload.name) client.name = payload.name.trim();
            if (payload.avatar) client.avatar = payload.avatar;
            break;

        case 'GET_BOARDS':
            client.send('BOARD_LIST', { boards: roomManager.getBoardList() });
            break;

        case 'JOIN_BOARD':
            roomManager.joinPublicBoard(client, payload.boardId || 'dhaka');
            break;

        case 'LEAVE_LOBBY':
            roomManager.leaveAnyLobby(client);
            break;

        case 'FORCE_START_LOBBY':
            roomManager.forceStartLobby(client);
            break;

        case 'CREATE_PRIVATE_ROOM':
            roomManager.createPrivateRoom(client, payload.playerCount || 4);
            break;

        case 'JOIN_PRIVATE_ROOM':
            roomManager.joinPrivateRoom(client, (payload.roomCode || '').trim());
            break;

        case 'ROLL_DICE':
            if (client.room) {
                client.room.handlePlayerRoll(client, payload.color || client.color);
            }
            break;

        case 'MOVE_TOKEN':
            if (client.room) {
                client.room.handlePlayerMove(client, payload.color || client.color, payload.tokenId);
            }
            break;

        case 'SEND_EMOTE':
            if (client.room) {
                client.room.broadcast('EMOTE_RECEIVED', {
                    color: client.color,
                    emoji: payload.emoji || '🎲'
                });
            }
            break;

        case 'SET_AUTO_PLAY':
            if (client.room) {
                client.room.handleAutoPlayToggle(client, !!payload.enabled);
            }
            break;

        case 'REJOIN_ROOM':
            if (payload.roomCode && payload.color) {
                const rejoined = roomManager.rejoinRoom(client, payload.roomCode, payload.color);
                if (!rejoined) {
                    client.send('NOTICE', { message: `ম্যাচ #${payload.roomCode} খুঁজে পাওয়া যায়নি অথবা শেষ হয়ে গেছে।` });
                }
            }
            break;

        case 'PING':
            client.send('PONG', { time: Date.now() });
            break;
    }
}

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`=================================================`);
        console.log(`  Ludo X BD Authoritative Node.js Server`);
        console.log(`  Port: ${PORT}`);
        console.log(`  Health Check: http://localhost:${PORT}/health`);
        if (process.env.RENDER_EXTERNAL_URL) {
            console.log(`  Render Cloud URL: ${process.env.RENDER_EXTERNAL_URL}`);
            // Auto self-ping to prevent sleep on Render free tier
            const healthUrl = `${process.env.RENDER_EXTERNAL_URL}/health`;
            const reqLib = healthUrl.startsWith('https') ? require('https') : http;
            setInterval(() => {
                reqLib.get(healthUrl, (res) => {}).on('error', () => {});
            }, 10 * 60 * 1000); // 10 minutes keep-alive
        }
        console.log(`=================================================`);
    });
}

module.exports = { server, roomManager, clients };
