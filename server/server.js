/**
 * Ludo X BD - Real-time Online Multiplayer Game Server (Node.js + WebSocket)
 * Handles Online Board Selection, 60-Second Countdown Waiting Lobbies,
 * Synchronized Live Match Play (Dice Rolls, Turns, Moves), and Reconnection.
 */

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// Predefined Bangladesh-themed Online Boards
const BOARDS = [
    { id: 'dhaka', name: 'ঢাকা এরিনা (Dhaka Arena)', fee: 500, winPrize: 1800, icon: '🏛️', color: '#38bdf8' },
    { id: 'chittagong', name: 'চট্টগ্রাম রয়্যালস (Chattogram Royals)', fee: 1000, winPrize: 3600, icon: '👑', color: '#facc15' },
    { id: 'sylhet', name: 'সিলেট সুপার কিংস (Sylhet Strikers)', fee: 2500, winPrize: 9000, icon: '⚡', color: '#4ade80' },
    { id: 'cox', name: 'কক্সবাজার গোল্ডেন বিচ (Cox\'s Bazar)', fee: 5000, winPrize: 18000, icon: '🏖️', color: '#fb923c' },
    { id: 'padma', name: 'পদ্মা এক্সপ্রেস (Padma Express)', fee: 10000, winPrize: 36000, icon: '🚄', color: '#f43f5e' }
];

const waitingLobbies = new Map(); // boardId -> WaitingLobby
const activeRooms = new Map();    // roomCode -> GameRoom
const clients = new Map();        // clientId -> Client

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            name: 'Ludo X BD Real-time Multiplayer Server',
            boardsCount: BOARDS.length,
            activeRooms: activeRooms.size,
            connectedClients: clients.size,
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

// RFC 6455 WebSocket Handshake
server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`
    ];

    socket.write(headers.join('\r\n') + '\r\n\r\n');

    const clientId = 'c_' + Math.random().toString(36).substring(2, 9);
    const client = {
        id: clientId,
        socket: socket,
        name: 'Player',
        avatar: 'king',
        currentLobby: null,
        currentRoom: null,
        color: null,
        send: function (type, payload) {
            sendWsFrame(this.socket, JSON.stringify({ type, payload }));
        }
    };

    clients.set(clientId, client);
    console.log(`[Multiplayer] Client connected: ${clientId} (Total: ${clients.size})`);

    // Greet client & send board list
    client.send('CONNECTED', { clientId, serverTime: Date.now() });
    sendBoardList(client);

    socket.on('data', (buffer) => {
        handleWsData(client, buffer);
    });

    socket.on('close', () => {
        handleDisconnect(client);
    });

    socket.on('error', (err) => {
        console.warn(`[Multiplayer Error] ${clientId}:`, err.message);
    });
});

function sendWsFrame(socket, message) {
    if (socket.destroyed) return;
    const msgBuffer = Buffer.from(message, 'utf8');
    const msgLength = msgBuffer.length;

    let header;
    if (msgLength < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text opcode
        header[1] = msgLength;
    } else if (msgLength < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(msgLength, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(msgLength), 2);
    }

    socket.write(Buffer.concat([header, msgBuffer]));
}

function handleWsData(client, buffer) {
    try {
        let offset = 0;
        const firstByte = buffer[offset++];
        const secondByte = buffer[offset++];
        const isMasked = (secondByte & 0x80) !== 0;
        let payloadLen = secondByte & 0x7f;

        if (payloadLen === 126) {
            payloadLen = buffer.readUInt16BE(offset);
            offset += 2;
        } else if (payloadLen === 127) {
            payloadLen = Number(buffer.readBigUInt64BE(offset));
            offset += 8;
        }

        let maskingKey = null;
        if (isMasked) {
            maskingKey = buffer.slice(offset, offset + 4);
            offset += 4;
        }

        const payload = buffer.slice(offset, offset + payloadLen);
        if (isMasked && maskingKey) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] ^= maskingKey[i % 4];
            }
        }

        const text = payload.toString('utf8');
        const packet = JSON.parse(text);
        processClientPacket(client, packet.type, packet.payload || {});
    } catch (e) {
        console.warn(`[Packet parse error from ${client.id}]:`, e.message);
    }
}

function processClientPacket(client, type, data) {
    switch (type) {
        case 'SET_PROFILE':
            client.name = data.name || client.name;
            client.avatar = data.avatar || client.avatar;
            break;

        case 'GET_BOARDS':
            sendBoardList(client);
            break;

        case 'JOIN_BOARD':
            handleJoinBoard(client, data.boardId);
            break;

        case 'LEAVE_LOBBY':
            handleLeaveLobby(client);
            break;

        case 'FORCE_START_LOBBY':
            handleForceStartLobby(client);
            break;

        case 'CREATE_CUSTOM_ROOM':
            handleCreateCustomRoom(client, data);
            break;

        case 'JOIN_CUSTOM_ROOM':
            handleJoinCustomRoom(client, data.roomCode);
            break;

        case 'ROLL_DICE':
            handleRollDice(client);
            break;

        case 'MOVE_TOKEN':
            handleMoveToken(client, data.tokenId);
            break;

        case 'SEND_EMOTE':
            handleSendEmote(client, data.emoji);
            break;

        case 'PING':
            client.send('PONG', { time: Date.now() });
            break;
    }
}

function sendBoardList(client) {
    const list = BOARDS.map(b => {
        const lobby = waitingLobbies.get(b.id);
        const waitingCount = lobby ? lobby.players.length : 0;
        const remainingSeconds = lobby ? lobby.remainingSeconds : 60;
        return {
            ...b,
            waitingCount,
            remainingSeconds,
            hasActiveLobby: waitingCount > 0
        };
    });
    client.send('BOARD_LIST', { boards: list });
}

function broadcastBoardListToAll() {
    clients.forEach(c => {
        if (!c.currentRoom && !c.currentLobby) {
            sendBoardList(c);
        }
    });
}

// -------------------------------------------------------------
// 1-Minute Waiting Lobby Logic (৬০ সেকেন্ডের অনলাইন কাউন্টডাউন)
// -------------------------------------------------------------
function handleJoinBoard(client, boardId) {
    handleLeaveLobby(client);
    handleLeaveRoom(client);

    const boardConfig = BOARDS.find(b => b.id === boardId) || BOARDS[0];
    let lobby = waitingLobbies.get(boardConfig.id);

    if (!lobby || lobby.players.length >= 4) {
        lobby = {
            boardId: boardConfig.id,
            boardName: boardConfig.name,
            entryFee: boardConfig.fee,
            winPrize: boardConfig.winPrize,
            players: [],
            colors: ['red', 'green', 'yellow', 'blue'],
            remainingSeconds: 60, // Exactly 1 minute
            timerInterval: null
        };
        waitingLobbies.set(boardConfig.id, lobby);

        // Start 60-Second Countdown
        lobby.timerInterval = setInterval(() => {
            lobby.remainingSeconds--;

            // Broadcast tick to all players in this lobby
            broadcastToLobby(lobby, 'LOBBY_TICK', {
                boardId: lobby.boardId,
                boardName: lobby.boardName,
                remainingSeconds: lobby.remainingSeconds,
                players: getLobbyPlayersData(lobby)
            });

            // Countdown finished! (1 minute over)
            if (lobby.remainingSeconds <= 0) {
                clearInterval(lobby.timerInterval);
                lobby.timerInterval = null;

                if (lobby.players.length >= 2) {
                    // Start match with joined players!
                    startMatchFromLobby(lobby);
                } else {
                    // Only 1 player joined after 60s
                    broadcastToLobby(lobby, 'LOBBY_TIMEOUT_SINGLE', {
                        message: '১ মিনিটে অন্য খেলোয়াড় যুক্ত হয়নি। আপনি কি আরও ৩০ সেকেন্ড অপেক্ষা করবেন নাকি রোবটের সাথে প্র্যাকটিস ম্যাচ খেলবেন?',
                        boardId: lobby.boardId
                    });
                    lobby.remainingSeconds = 30; // Extend by 30s
                    // Re-arm timer for 30s extension
                    lobby.timerInterval = setInterval(() => {
                        lobby.remainingSeconds--;
                        broadcastToLobby(lobby, 'LOBBY_TICK', {
                            boardId: lobby.boardId,
                            remainingSeconds: lobby.remainingSeconds,
                            players: getLobbyPlayersData(lobby)
                        });
                        if (lobby.remainingSeconds <= 0) {
                            clearInterval(lobby.timerInterval);
                            lobby.timerInterval = null;
                            if (lobby.players.length >= 2) {
                                startMatchFromLobby(lobby);
                            }
                        }
                    }, 1000);
                }
            }
        }, 1000);
    }

    // Assign color based on slot
    const colorIndex = lobby.players.length;
    client.color = lobby.colors[colorIndex];
    client.currentLobby = lobby;

    lobby.players.push({
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        color: client.color,
        client: client
    });

    console.log(`[Multiplayer] ${client.name} joined board ${boardConfig.name} (${lobby.players.length}/4)`);

    // Notify player that they joined the lobby
    client.send('LOBBY_JOINED', {
        boardId: lobby.boardId,
        boardName: lobby.boardName,
        entryFee: lobby.entryFee,
        winPrize: lobby.winPrize,
        myColor: client.color,
        remainingSeconds: lobby.remainingSeconds,
        players: getLobbyPlayersData(lobby)
    });

    // Notify all players in lobby of new joiner
    broadcastToLobby(lobby, 'PLAYER_JOINED_LOBBY', {
        joinedPlayer: { id: client.id, name: client.name, color: client.color, avatar: client.avatar },
        players: getLobbyPlayersData(lobby),
        remainingSeconds: lobby.remainingSeconds
    });

    broadcastBoardListToAll();

    // If lobby reaches 4/4 players, start match immediately without waiting for 60s
    if (lobby.players.length === 4) {
        if (lobby.timerInterval) clearInterval(lobby.timerInterval);
        startMatchFromLobby(lobby);
    }
}

function handleForceStartLobby(client) {
    const lobby = client.currentLobby;
    if (!lobby) return;

    if (lobby.players.length >= 2) {
        if (lobby.timerInterval) clearInterval(lobby.timerInterval);
        startMatchFromLobby(lobby);
    } else {
        client.send('NOTICE', { message: 'ম্যাচ শুরু করতে অন্তত ২ জন খেলোয়াড় প্রয়োজন!' });
    }
}

function handleLeaveLobby(client) {
    const lobby = client.currentLobby;
    if (!lobby) return;

    const idx = lobby.players.findIndex(p => p.id === client.id);
    if (idx !== -1) {
        lobby.players.splice(idx, 1);
        client.currentLobby = null;

        if (lobby.players.length === 0) {
            if (lobby.timerInterval) clearInterval(lobby.timerInterval);
            waitingLobbies.delete(lobby.boardId);
        } else {
            broadcastToLobby(lobby, 'PLAYER_LEFT_LOBBY', {
                leftColor: client.color,
                players: getLobbyPlayersData(lobby),
                remainingSeconds: lobby.remainingSeconds
            });
        }
    }
    broadcastBoardListToAll();
}

function startMatchFromLobby(lobby) {
    waitingLobbies.delete(lobby.boardId);
    broadcastBoardListToAll();

    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const gameRoom = {
        code: roomCode,
        boardId: lobby.boardId,
        boardName: lobby.boardName,
        entryFee: lobby.entryFee,
        winPrize: lobby.winPrize,
        players: [...lobby.players],
        activeColors: lobby.players.map(p => p.color),
        currentTurnIndex: 0,
        gameState: 'PLAYING',
        diceValue: 1,
        turnTimer: null
    };

    activeRooms.set(roomCode, gameRoom);

    // Update clients
    lobby.players.forEach(p => {
        p.client.currentLobby = null;
        p.client.currentRoom = gameRoom;
    });

    console.log(`[Multiplayer] Match started on ${lobby.boardName}! Room #${roomCode} with ${lobby.players.length} players.`);

    broadcastToRoom(gameRoom, 'MATCH_STARTED', {
        roomCode: gameRoom.code,
        boardId: gameRoom.boardId,
        boardName: gameRoom.boardName,
        winPrize: gameRoom.winPrize,
        players: getRoomPlayersData(gameRoom),
        activeColors: gameRoom.activeColors,
        startingTurn: gameRoom.activeColors[0]
    });

    resetTurnTimer(gameRoom);
}

// -------------------------------------------------------------
// Synchronized In-Game Play (Dice Roll, Token Move, Turn Cycle)
// -------------------------------------------------------------
function handleRollDice(client) {
    const room = client.currentRoom;
    if (!room || room.gameState !== 'PLAYING') return;

    const currentTurnColor = room.activeColors[room.currentTurnIndex];
    if (client.color !== currentTurnColor) {
        client.send('NOTICE', { message: 'এখন আপনার চাল নয়!' });
        return;
    }

    // Server-authoritative Dice Roll with 1-6 balanced odds
    let roll;
    const rnd = Math.random();
    if (rnd < 0.22) roll = 6; // balanced ~22% for 6
    else roll = Math.floor(Math.random() * 5) + 1;

    room.diceValue = roll;

    console.log(`[Room #${room.code}] Player ${client.name} (${client.color}) rolled: ${roll}`);

    broadcastToRoom(room, 'DICE_ROLLED', {
        color: currentTurnColor,
        roll: roll,
        isSix: roll === 6
    });

    // Reset turn timer with extra 12s for moving token
    resetTurnTimer(room, 15);
}

function handleMoveToken(client, tokenId) {
    const room = client.currentRoom;
    if (!room || room.gameState !== 'PLAYING') return;

    const currentTurnColor = room.activeColors[room.currentTurnIndex];
    if (client.color !== currentTurnColor) return;

    console.log(`[Room #${room.code}] Player ${client.name} (${client.color}) moved token: ${tokenId}`);

    broadcastToRoom(room, 'TOKEN_MOVED', {
        color: currentTurnColor,
        tokenId: tokenId,
        diceValue: room.diceValue
    });

    // If rolled 6, gets another turn; otherwise advance to next player
    if (room.diceValue !== 6) {
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.activeColors.length;
    }

    const nextColor = room.activeColors[room.currentTurnIndex];
    broadcastToRoom(room, 'TURN_CHANGED', {
        nextTurn: nextColor
    });

    resetTurnTimer(room, 15);
}

function resetTurnTimer(room, seconds = 15) {
    if (room.turnTimer) clearTimeout(room.turnTimer);

    room.turnTimer = setTimeout(() => {
        if (room.gameState !== 'PLAYING') return;

        const timedOutColor = room.activeColors[room.currentTurnIndex];
        broadcastToRoom(room, 'TURN_TIMEOUT', {
            timedOutColor: timedOutColor
        });

        // Switch to next player on AFK
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.activeColors.length;
        const nextColor = room.activeColors[room.currentTurnIndex];
        broadcastToRoom(room, 'TURN_CHANGED', {
            nextTurn: nextColor
        });

        resetTurnTimer(room, 15);
    }, seconds * 1000);
}

function handleSendEmote(client, emoji) {
    const room = client.currentRoom;
    if (!room) return;
    broadcastToRoom(room, 'EMOTE_RECEIVED', {
        color: client.color,
        emoji: emoji || '🎲'
    });
}

function handleCreateCustomRoom(client, data) {
    handleLeaveLobby(client);
    handleLeaveRoom(client);

    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const gameRoom = {
        code: roomCode,
        boardId: 'custom',
        boardName: 'কাস্টম রুম #' + roomCode,
        entryFee: 0,
        winPrize: 0,
        players: [],
        colors: ['red', 'green', 'yellow', 'blue'],
        activeColors: [],
        currentTurnIndex: 0,
        gameState: 'CUSTOM_LOBBY',
        diceValue: 1,
        turnTimer: null
    };

    activeRooms.set(roomCode, gameRoom);

    client.color = 'red';
    client.currentRoom = gameRoom;
    gameRoom.players.push({
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        color: 'red',
        client: client
    });
    gameRoom.activeColors.push('red');

    client.send('CUSTOM_ROOM_CREATED', {
        roomCode,
        color: 'red',
        players: getRoomPlayersData(gameRoom)
    });
}

function handleJoinCustomRoom(client, roomCode) {
    handleLeaveLobby(client);
    handleLeaveRoom(client);

    const room = activeRooms.get(roomCode);
    if (!room) {
        client.send('JOIN_FAILED', { message: 'ভুল রুম কোড! রুমটি পাওয়া যায়নি।' });
        return;
    }
    if (room.players.length >= 4) {
        client.send('JOIN_FAILED', { message: 'এই রুমটি ইতিমধ্যে পূর্ণ হয়ে গেছে!' });
        return;
    }

    const color = room.colors[room.players.length];
    client.color = color;
    client.currentRoom = room;

    room.players.push({
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        color: color,
        client: client
    });
    room.activeColors.push(color);

    client.send('CUSTOM_ROOM_JOINED', {
        roomCode,
        color,
        players: getRoomPlayersData(room)
    });

    broadcastToRoom(room, 'PLAYER_JOINED_ROOM', {
        joinedPlayer: { id: client.id, name: client.name, color: color, avatar: client.avatar },
        players: getRoomPlayersData(room)
    });
}

function handleLeaveRoom(client) {
    const room = client.currentRoom;
    if (!room) return;

    const idx = room.players.findIndex(p => p.id === client.id);
    if (idx !== -1) {
        room.players.splice(idx, 1);
        const cIdx = room.activeColors.indexOf(client.color);
        if (cIdx !== -1) room.activeColors.splice(cIdx, 1);

        client.currentRoom = null;

        if (room.players.length === 0) {
            if (room.turnTimer) clearTimeout(room.turnTimer);
            activeRooms.delete(room.code);
        } else {
            broadcastToRoom(room, 'PLAYER_LEFT_ROOM', {
                leftColor: client.color,
                players: getRoomPlayersData(room)
            });
        }
    }
}

function handleDisconnect(client) {
    handleLeaveLobby(client);
    handleLeaveRoom(client);
    clients.delete(client.id);
    console.log(`[Multiplayer] Client disconnected: ${client.id} (Remaining: ${clients.size})`);
}

function broadcastToLobby(lobby, type, payload) {
    lobby.players.forEach(p => {
        if (p.client && !p.client.socket.destroyed) {
            p.client.send(type, payload);
        }
    });
}

function broadcastToRoom(room, type, payload) {
    room.players.forEach(p => {
        if (p.client && !p.client.socket.destroyed) {
            p.client.send(type, payload);
        }
    });
}

function getLobbyPlayersData(lobby) {
    return lobby.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color
    }));
}

function getRoomPlayersData(room) {
    return room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color
    }));
}

server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`  Ludo X BD Real-time Multiplayer Server ONLINE`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Boards: ${BOARDS.length} Bangladesh Arenas`);
    console.log(`  Waiting Room Timer: 60 Seconds Active`);
    console.log(`=================================================`);
});
