// Room and Matchmaking Manager for Ludo X BD
// 100% Authoritative Server - Zero Peer-to-Peer Dependence
const AuthoritativeEngine = require('./authoritative_engine');
const BotController = require('./bot_controller');
const CryptoRNG = require('./crypto_rng');
const SupabaseService = require('./supabase_service');

const BOARD_DEFINITIONS = [
    { id: 'dhaka', name: 'ঢাকা এরিনা (Dhaka Arena)', fee: 500, winPrize: 1800, icon: '🏛️' },
    { id: 'chittagong', name: 'চট্টগ্রাম রয়্যালস (Chattogram)', fee: 1000, winPrize: 3600, icon: '👑' },
    { id: 'sylhet', name: 'সিলেট সুপার কিংস (Sylhet)', fee: 2500, winPrize: 9000, icon: '⚡' },
    { id: 'cox', name: 'কক্সবাজার গোল্ডেন বিচ (Cox\'s Bazar)', fee: 5000, winPrize: 18000, icon: '🏖️' },
    { id: 'padma', name: 'পদ্মা এক্সপ্রেস (Padma Express)', fee: 10000, winPrize: 36000, icon: '🚄' }
];

const BOT_NAMES = [
    'সাকিব_কিং 🇧🇩 🤖',
    'তামিম_প্রো 🇧🇩 🤖',
    'রাহুল_লুডু 🇧🇩 🤖',
    'মুস্তাফিজ_স্পিন 🇧🇩 🤖'
];

const COLORS = ['red', 'green', 'yellow', 'blue'];

class WaitingLobby {
    constructor(boardId, roomManager, maxPlayers = 4) {
        this.boardId = boardId;
        this.roomManager = roomManager;
        this.maxPlayers = maxPlayers;
        this.players = []; // array of ClientSession
        this.remainingSeconds = 15; // 15-second countdown for matchmaking
        this.isPrivate = false;
        this.roomCode = null;
        this.started = false;

        this.timer = setInterval(() => {
            this.remainingSeconds--;
            this.broadcast('LOBBY_TICK', {
                boardId: this.boardId,
                remainingSeconds: this.remainingSeconds,
                players: this.getPlayersSummary()
            });

            if (this.remainingSeconds <= 0) {
                this.startMatch();
            }
        }, 1000);
    }

    addPlayer(client) {
        if (this.players.length >= this.maxPlayers) return false;
        const assignedColor = COLORS[this.players.length];
        client.color = assignedColor;
        client.lobby = this;
        this.players.push(client);
        return true;
    }

    removePlayer(client) {
        const idx = this.players.indexOf(client);
        if (idx !== -1) {
            this.players.splice(idx, 1);
            client.lobby = null;
            this.players.forEach((p, i) => { p.color = COLORS[i]; });
        }
    }

    getPlayersSummary() {
        return this.players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            avatar: p.avatar,
            isBot: false
        }));
    }

    broadcast(type, payload) {
        this.players.forEach(p => {
            if (!p.isClosed) p.send(type, payload);
        });
    }

    startMatch() {
        if (this.started) return;
        this.started = true;
        clearInterval(this.timer);

        const code = this.roomCode || CryptoRNG.generateRoomCode();
        this.roomManager.removeWaitingLobby(this.boardId, this.roomCode);

        // Prepare player list with smart bot backfill
        const allPlayers = [];
        let botIdx = 0;

        for (const p of this.players) {
            allPlayers.push({
                id: p.id,
                name: p.name,
                color: p.color,
                isBot: false,
                autoPlay: false,
                session: p
            });
        }

        // Fill remaining empty slots with bots
        for (let i = allPlayers.length; i < this.maxPlayers; i++) {
            const bColor = COLORS[i];
            const bName = BOT_NAMES[botIdx % BOT_NAMES.length];
            botIdx++;
            allPlayers.push({
                id: 'bot_' + bColor,
                name: bName,
                color: bColor,
                isBot: true,
                autoPlay: true,
                session: null
            });
        }

        const gameRoom = new GameRoom(code, this.boardId, allPlayers, this.roomManager);
        this.roomManager.addGameRoom(code, gameRoom);

        // Transition players to game room
        this.players.forEach(p => {
            p.lobby = null;
            p.room = gameRoom;
        });

        const boardDef = BOARD_DEFINITIONS.find(b => b.id === this.boardId);
        const boardName = boardDef ? boardDef.name : (this.isPrivate ? `রুম #${code}` : 'অনলাইন এরিনা');
        const entryFee = boardDef ? boardDef.fee : 0;

        console.log(`[RoomManager] Match started: Room #${code} (${this.boardId}) with ${this.players.length} humans and ${allPlayers.length - this.players.length} bots.`);

        gameRoom.broadcast('MATCH_STARTED', {
            roomCode: code,
            boardId: this.boardId,
            boardName: boardName,
            entryFee: entryFee,
            hostId: 'cloud_server', // Server is the sole host!
            players: allPlayers.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                isBot: p.isBot,
                autoPlay: p.autoPlay
            })),
            startingTurn: 'red'
        });

        gameRoom.scheduleTurnWatchdog();
    }
}

class GameRoom {
    constructor(code, boardId, players, roomManager) {
        this.code = code;
        this.boardId = boardId;
        this.players = players; // array of { id, name, color, isBot, autoPlay, session }
        this.roomManager = roomManager;
        this.turnWatchdogTimer = null;
        this.currentStage = 'ROLL'; // 'ROLL' or 'MOVE'
        this.stageDeadlineMs = 0;

        this.engine = new AuthoritativeEngine({
            roomCode: code,
            boardId: boardId,
            players: players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                isBot: p.isBot
            }))
        });
    }

    getPlayerByColor(color) {
        return this.players.find(p => p.color === color);
    }

    getPlayerById(id) {
        return this.players.find(p => p.id === id);
    }

    broadcast(type, payload) {
        this.players.forEach(p => {
            if (p.session && !p.session.isClosed) {
                p.session.send(type, payload);
            }
        });
    }

    scheduleTurnWatchdog() {
        if (this.turnWatchdogTimer) {
            clearTimeout(this.turnWatchdogTimer);
            this.turnWatchdogTimer = null;
        }
        if (this.engine.state === 'GAME_OVER') return;

        const curPlayer = this.engine.getCurrentPlayer();
        const pObj = this.getPlayerByColor(curPlayer.color);

        // Check if player is a Bot, or has Auto-Play enabled, or is currently Disconnected
        const isAutomated = !pObj || pObj.isBot || pObj.autoPlay || !pObj.session || pObj.session.isClosed;

        if (isAutomated) {
            // Realistic bot delay: 750ms to 950ms
            this.turnWatchdogTimer = setTimeout(() => {
                this.executeBotTurn();
            }, 850);
            return;
        }

        // Active Human Player Turn: 15-Second Watchdog Timer
        this.currentStage = 'ROLL';
        this.stageDeadlineMs = Date.now() + 15000;

        this.broadcast('TURN_STAGE_SYNC', {
            color: curPlayer.color,
            stage: 'ROLL',
            deadlineMs: this.stageDeadlineMs
        });

        this.turnWatchdogTimer = setTimeout(() => {
            console.log(`[GameRoom #${this.code}] 15s Timeout on ROLL for ${curPlayer.color}. Bot taking over!`);
            pObj.autoPlay = true;

            this.broadcast('TURN_TIMEOUT', { timedOutColor: curPlayer.color });
            this.broadcast('PLAYER_STATUS_CHANGED', {
                color: curPlayer.color,
                isBot: false,
                autoPlay: true,
                reason: 'timeout'
            });

            this.executeBotTurn();
        }, 15000);
    }

    scheduleMoveWatchdog(color) {
        if (this.turnWatchdogTimer) {
            clearTimeout(this.turnWatchdogTimer);
            this.turnWatchdogTimer = null;
        }
        if (this.engine.state === 'GAME_OVER') return;

        const pObj = this.getPlayerByColor(color);
        const isAutomated = !pObj || pObj.isBot || pObj.autoPlay || !pObj.session || pObj.session.isClosed;

        if (isAutomated) {
            // Auto move with 600ms delay
            this.turnWatchdogTimer = setTimeout(() => {
                this.executeBotMoveChoice();
            }, 650);
            return;
        }

        this.currentStage = 'MOVE';
        this.stageDeadlineMs = Date.now() + 15000;

        this.broadcast('TURN_STAGE_SYNC', {
            color: color,
            stage: 'MOVE',
            deadlineMs: this.stageDeadlineMs,
            validTokens: this.engine.validMoves.map(m => m.token.id)
        });

        this.turnWatchdogTimer = setTimeout(() => {
            console.log(`[GameRoom #${this.code}] 15s Timeout on MOVE for ${color}. Auto-moving best token!`);
            pObj.autoPlay = true;

            this.broadcast('TURN_TIMEOUT', { timedOutColor: color });
            this.broadcast('PLAYER_STATUS_CHANGED', {
                color: color,
                isBot: false,
                autoPlay: true,
                reason: 'timeout'
            });

            this.executeBotMoveChoice();
        }, 15000);
    }

    handlePlayerRoll(client, color) {
        const curPlayer = this.engine.getCurrentPlayer();
        if (curPlayer.color !== color) return;
        if (client.color !== color) return; // anti-cheat: only active player can roll
        if (this.engine.state !== 'WAITING_ROLL') return;

        if (this.turnWatchdogTimer) {
            clearTimeout(this.turnWatchdogTimer);
            this.turnWatchdogTimer = null;
        }

        const pObj = this.getPlayerByColor(color);
        // If human rolls manually while in autoPlay mode, turn Auto Play OFF!
        if (pObj && pObj.autoPlay) {
            pObj.autoPlay = false;
            this.broadcast('PLAYER_STATUS_CHANGED', {
                color: color,
                isBot: false,
                autoPlay: false,
                reason: 'manual_roll'
            });
        }

        const rollResult = this.engine.executeRoll();

        this.broadcast('DICE_ROLLED', {
            color: color,
            roll: rollResult.dice,
            isSix: (rollResult.dice === 6),
            validTokens: rollResult.validTokens || [],
            threeSixesCanceled: rollResult.threeSixesCanceled,
            noMoves: rollResult.noMoves
        });

        if (rollResult.threeSixesCanceled || rollResult.noMoves) {
            this.broadcast('TURN_CHANGED', { nextTurn: rollResult.nextTurn });
            this.scheduleTurnWatchdog();
        } else {
            // Stage B: Token Move Selection
            this.scheduleMoveWatchdog(color);
        }
    }

    handlePlayerMove(client, color, tokenId) {
        const curPlayer = this.engine.getCurrentPlayer();
        if (curPlayer.color !== color) return;
        if (client.color !== color) return; // anti-cheat
        if (this.engine.state !== 'SELECTING_TOKEN') return;

        if (this.turnWatchdogTimer) {
            clearTimeout(this.turnWatchdogTimer);
            this.turnWatchdogTimer = null;
        }

        const pObj = this.getPlayerByColor(color);
        if (pObj && pObj.autoPlay) {
            pObj.autoPlay = false;
            this.broadcast('PLAYER_STATUS_CHANGED', {
                color: color,
                isBot: false,
                autoPlay: false,
                reason: 'manual_move'
            });
        }

        const moveResult = this.engine.executeMove(tokenId);
        if (moveResult.error) {
            console.warn(`[GameRoom #${this.code}] Illegal move attempted by ${client.name}:`, moveResult);
            return;
        }

        this.broadcast('TOKEN_MOVED', {
            color: color,
            tokenId: tokenId,
            diceValue: this.engine.diceValue,
            dice: this.engine.diceValue,
            stepCount: moveResult.stepCount,
            targetStepCount: moveResult.stepCount,
            trackIndex: moveResult.trackIndex,
            tokenState: moveResult.tokenState,
            targetState: moveResult.tokenState,
            cutOccurred: moveResult.cutOccurred,
            cutTokenInfo: moveResult.cutTokenInfo,
            cutTokens: moveResult.cutTokens,
            tokenFinished: moveResult.tokenFinished,
            bonusTurn: moveResult.bonusTurn,
            playerWon: moveResult.playerWon,
            gameOver: moveResult.gameOver,
            winners: moveResult.winners,
            nextTurn: moveResult.nextTurn,
            boardSnapshot: this.engine.getStateSnapshot().players
        });

        if (moveResult.gameOver) {
            console.log(`[GameRoom #${this.code}] Game Over! Winners:`, moveResult.winners);
            SupabaseService.recordMatch(this.code, this.engine.mode, moveResult.winners, this.players.map(p => ({
                color: p.color,
                name: p.name,
                finished: p.tokens ? p.tokens.filter(t => t.state === 'FINISHED').length : 0
            })));
            return;
        }

        this.broadcast('TURN_CHANGED', { nextTurn: moveResult.nextTurn });
        this.scheduleTurnWatchdog();
    }

    executeBotTurn() {
        if (this.engine.state === 'GAME_OVER') return;
        if (this.engine.state !== 'WAITING_ROLL') return;

        const curPlayer = this.engine.getCurrentPlayer();
        const rollResult = this.engine.executeRoll();

        this.broadcast('DICE_ROLLED', {
            color: curPlayer.color,
            roll: rollResult.dice,
            isSix: (rollResult.dice === 6),
            validTokens: rollResult.validTokens || [],
            threeSixesCanceled: rollResult.threeSixesCanceled,
            noMoves: rollResult.noMoves,
            isAuto: true
        });

        if (rollResult.threeSixesCanceled || rollResult.noMoves) {
            this.broadcast('TURN_CHANGED', { nextTurn: rollResult.nextTurn });
            this.scheduleTurnWatchdog();
            return;
        }

        // Move token after realistic thinking pause
        setTimeout(() => {
            this.executeBotMoveChoice();
        }, 650);
    }

    executeBotMoveChoice() {
        if (this.engine.state === 'GAME_OVER') return;
        if (this.engine.state !== 'SELECTING_TOKEN') return;

        const curPlayer = this.engine.getCurrentPlayer();
        const bestTokenId = BotController.chooseBestMove(this.engine);

        if (bestTokenId !== null && bestTokenId !== undefined) {
            const moveResult = this.engine.executeMove(bestTokenId);
            this.broadcast('TOKEN_MOVED', {
                color: curPlayer.color,
                tokenId: bestTokenId,
                diceValue: this.engine.diceValue,
                dice: this.engine.diceValue,
                stepCount: moveResult.stepCount,
                targetStepCount: moveResult.stepCount,
                trackIndex: moveResult.trackIndex,
                tokenState: moveResult.tokenState,
                targetState: moveResult.tokenState,
                cutOccurred: moveResult.cutOccurred,
                cutTokenInfo: moveResult.cutTokenInfo,
                cutTokens: moveResult.cutTokens,
                tokenFinished: moveResult.tokenFinished,
                bonusTurn: moveResult.bonusTurn,
                playerWon: moveResult.playerWon,
                gameOver: moveResult.gameOver,
                winners: moveResult.winners,
                nextTurn: moveResult.nextTurn,
                isAuto: true,
                boardSnapshot: this.engine.getStateSnapshot().players
            });

            if (!moveResult.gameOver) {
                this.broadcast('TURN_CHANGED', { nextTurn: moveResult.nextTurn });
                this.scheduleTurnWatchdog();
            } else {
                console.log(`[GameRoom #${this.code}] Game Over (Bot Move)! Winners:`, moveResult.winners);
                SupabaseService.recordMatch(this.code, this.engine.mode, moveResult.winners, this.players.map(p => ({
                    color: p.color,
                    name: p.name,
                    finished: p.tokens ? p.tokens.filter(t => t.state === 'FINISHED').length : 0
                })));
            }
        } else {
            this.engine.passTurn();
            this.broadcast('TURN_CHANGED', { nextTurn: this.engine.getCurrentPlayer().color });
            this.scheduleTurnWatchdog();
        }
    }

    handleAutoPlayToggle(client, enabled) {
        const pObj = this.players.find(p => p.session && p.session.id === client.id);
        if (!pObj) return;

        pObj.autoPlay = !!enabled;
        console.log(`[GameRoom #${this.code}] Player ${pObj.name} (${pObj.color}) set Auto-Play to ${pObj.autoPlay}`);

        this.broadcast('PLAYER_STATUS_CHANGED', {
            color: pObj.color,
            isBot: pObj.isBot,
            autoPlay: pObj.autoPlay,
            reason: 'user_toggle'
        });

        // If client turned off autoPlay and it is currently their turn, reset watchdog to give them full 15s!
        const curPlayer = this.engine.getCurrentPlayer();
        if (curPlayer.color === pObj.color && !pObj.autoPlay) {
            if (this.engine.state === 'WAITING_ROLL') {
                this.scheduleTurnWatchdog();
            } else if (this.engine.state === 'SELECTING_TOKEN') {
                this.scheduleMoveWatchdog(pObj.color);
            }
        }
    }

    handleReconnect(client, color) {
        const pObj = this.getPlayerByColor(color);
        if (!pObj) return false;

        pObj.session = client;
        pObj.autoPlay = false; // Rejoining human turns off auto-play by default
        client.room = this;
        client.color = color;

        console.log(`[GameRoom #${this.code}] Player ${client.name} (${color}) reconnected! Syncing full state...`);

        client.send('MATCH_REJOINED', {
            roomCode: this.code,
            boardId: this.boardId,
            myColor: color,
            snapshot: this.engine.getStateSnapshot(),
            currentTurn: this.engine.getCurrentPlayer().color,
            stage: this.currentStage,
            remainingDeadlineMs: Math.max(0, this.stageDeadlineMs - Date.now())
        });

        this.broadcast('PLAYER_REJOINED_MATCH', {
            color: color,
            name: pObj.name
        });

        this.broadcast('PLAYER_STATUS_CHANGED', {
            color: color,
            isBot: pObj.isBot,
            autoPlay: false,
            reason: 'reconnect'
        });

        return true;
    }

    handleDisconnect(client) {
        const pObj = this.players.find(p => p.session && p.session.id === client.id);
        if (!pObj) return;

        console.log(`[GameRoom #${this.code}] Client ${client.name} (${pObj.color}) dropped connection. Setting autoPlay=true.`);
        pObj.session = null;
        pObj.autoPlay = true;

        this.broadcast('PLAYER_STATUS_CHANGED', {
            color: pObj.color,
            isBot: false,
            autoPlay: true,
            reason: 'disconnect'
        });

        // If it was currently this player's turn, accelerate auto-play so others do not wait!
        const curPlayer = this.engine.getCurrentPlayer();
        if (curPlayer.color === pObj.color) {
            if (this.turnWatchdogTimer) clearTimeout(this.turnWatchdogTimer);
            this.turnWatchdogTimer = setTimeout(() => {
                if (this.engine.state === 'WAITING_ROLL') {
                    this.executeBotTurn();
                } else if (this.engine.state === 'SELECTING_TOKEN') {
                    this.executeBotMoveChoice();
                }
            }, 600);
        }
    }
}

class RoomManager {
    constructor() {
        this.publicLobbies = new Map(); // boardId -> WaitingLobby
        this.privateLobbies = new Map(); // roomCode -> WaitingLobby
        this.activeGameRooms = new Map(); // roomCode -> GameRoom
    }

    getBoardList() {
        return BOARD_DEFINITIONS.map(b => {
            const lob = this.publicLobbies.get(b.id);
            return {
                id: b.id,
                name: b.name,
                fee: b.fee,
                winPrize: b.winPrize,
                icon: b.icon,
                waitingCount: lob ? lob.players.length : 0,
                remainingSeconds: lob ? lob.remainingSeconds : 15
            };
        });
    }

    joinPublicBoard(client, boardId) {
        this.leaveAnyLobby(client);

        let lobby = this.publicLobbies.get(boardId);
        if (!lobby || lobby.started) {
            lobby = new WaitingLobby(boardId, this, 4);
            this.publicLobbies.set(boardId, lobby);
        }

        const joined = lobby.addPlayer(client);
        if (!joined) {
            client.send('NOTICE', { message: 'এই বোর্ডটি পূর্ণ হয়ে গেছে!' });
            return;
        }

        console.log(`[Public Matchmaking] Player ${client.name} (${client.color}) joined ${boardId} (${lobby.players.length}/4)`);

        client.send('LOBBY_JOINED', {
            boardId: boardId,
            myColor: client.color,
            remainingSeconds: lobby.remainingSeconds,
            players: lobby.getPlayersSummary()
        });

        lobby.broadcast('PLAYER_JOINED_LOBBY', {
            joinedPlayer: { name: client.name, color: client.color },
            players: lobby.getPlayersSummary(),
            remainingSeconds: lobby.remainingSeconds
        });

        if (lobby.players.length === 4) {
            lobby.startMatch();
        }
    }

    createPrivateRoom(client, maxPlayers = 4) {
        this.leaveAnyLobby(client);
        const code = CryptoRNG.generateRoomCode();

        const lobby = new WaitingLobby('private', this, maxPlayers);
        lobby.isPrivate = true;
        lobby.roomCode = code;
        this.privateLobbies.set(code, lobby);

        lobby.addPlayer(client);

        console.log(`[Private Room] Room #${code} created by ${client.name} (${maxPlayers} players)`);

        client.send('PRIVATE_ROOM_CREATED', {
            roomCode: code,
            myColor: client.color,
            maxPlayers: maxPlayers,
            remainingSeconds: lobby.remainingSeconds,
            players: lobby.getPlayersSummary()
        });

        client.send('LOBBY_JOINED', {
            boardId: 'private',
            boardName: `বন্ধুদের সাথে প্রাইভেট রুম #${code}`,
            roomCode: code,
            myColor: client.color,
            remainingSeconds: lobby.remainingSeconds,
            players: lobby.getPlayersSummary()
        });
    }

    joinPrivateRoom(client, code) {
        this.leaveAnyLobby(client);

        // Check if there is an active match running for reconnection
        const activeRoom = this.activeGameRooms.get(code);
        if (activeRoom) {
            // Check if client can reconnect to one of the human slots
            const candidate = activeRoom.players.find(p => !p.isBot && (!p.session || p.session.isClosed));
            if (candidate) {
                activeRoom.handleReconnect(client, candidate.color);
                return;
            }
        }

        const lobby = this.privateLobbies.get(code);
        if (!lobby) {
            client.send('NOTICE', { message: `রুম কোড #${code} পাওয়া যায়নি! অনুগ্রহ করে সঠিক কোড দিন।` });
            return;
        }

        if (lobby.started) {
            client.send('NOTICE', { message: `রুম #${code}-এর খেলা ইতিমধ্যে শুরু হয়ে গেছে!` });
            return;
        }

        const joined = lobby.addPlayer(client);
        if (!joined) {
            client.send('NOTICE', { message: `রুম #${code} ইতিমধ্যে পূর্ণ হয়ে গেছে!` });
            return;
        }

        console.log(`[Private Room] Player ${client.name} joined room #${code} (${lobby.players.length}/${lobby.maxPlayers})`);

        client.send('LOBBY_JOINED', {
            boardId: 'private',
            boardName: `বন্ধুদের সাথে প্রাইভেট রুম #${code}`,
            roomCode: code,
            myColor: client.color,
            remainingSeconds: lobby.remainingSeconds,
            players: lobby.getPlayersSummary()
        });

        lobby.broadcast('PLAYER_JOINED_LOBBY', {
            joinedPlayer: { name: client.name, color: client.color },
            players: lobby.getPlayersSummary(),
            remainingSeconds: lobby.remainingSeconds
        });

        if (lobby.players.length >= lobby.maxPlayers) {
            lobby.startMatch();
        }
    }

    rejoinRoom(client, roomCode, color) {
        const activeRoom = this.activeGameRooms.get(roomCode);
        if (activeRoom) {
            return activeRoom.handleReconnect(client, color);
        }
        return false;
    }

    forceStartLobby(client) {
        if (client.lobby && client.lobby.players.length >= 1) {
            client.lobby.startMatch();
        }
    }

    leaveAnyLobby(client) {
        if (client.lobby) {
            const lobby = client.lobby;
            lobby.removePlayer(client);

            if (lobby.players.length === 0) {
                clearInterval(lobby.timer);
                if (lobby.isPrivate && lobby.roomCode) {
                    this.privateLobbies.delete(lobby.roomCode);
                } else {
                    this.publicLobbies.delete(lobby.boardId);
                }
            } else {
                lobby.broadcast('PLAYER_LEFT_LOBBY', {
                    leftColor: client.color,
                    players: lobby.getPlayersSummary(),
                    remainingSeconds: lobby.remainingSeconds
                });
            }
        }
    }

    removeWaitingLobby(boardId, roomCode) {
        if (roomCode) {
            this.privateLobbies.delete(roomCode);
        } else if (boardId) {
            this.publicLobbies.delete(boardId);
        }
    }

    addGameRoom(code, gameRoom) {
        this.activeGameRooms.set(code, gameRoom);
    }

    getGameRoom(code) {
        return this.activeGameRooms.get(code);
    }

    handleDisconnect(client) {
        this.leaveAnyLobby(client);
        if (client.room) {
            client.room.handleDisconnect(client);
        }
    }
}

module.exports = RoomManager;
