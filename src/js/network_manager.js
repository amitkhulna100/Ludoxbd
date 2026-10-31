/**
 * Ludo X BD - Authoritative Real-Time Cloud Game Server Network Manager
 * 100% Server-Authoritative Architecture (Zero Peer-to-Peer Desync)
 * 
 * Single Source of Truth: Node.js WebSocket Game Server
 * Persistent DB & Economy: Supabase Database REST API
 */

const AUTHORITATIVE_SERVER_CONFIG = {
    // 1. Primary Render Production Cloud WebSocket Server (Authorized Single Source of Truth)
    cloudWsUrl: 'wss://ludoxbd.onrender.com',

    // 2. Custom Tunnel / Server URL saved by user in Settings or Dev
    get customUrl() {
        return localStorage.getItem('lx_game_server_url') || '';
    },

    // 3. Localhost / Local PC Wi-Fi URL (e.g. 192.168.0.102:3000)
    localWsUrl: 'ws://127.0.0.1:3000',

    // 4. Supabase Realtime Fallback Gateway
    supabaseWsUrl: 'wss://oispsbtnmehtxcjwjlcr.supabase.co/realtime/v1/websocket?apikey=sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah&vsn=1.0.0',

    getActiveWsUrl() {
        if (this.customUrl && this.customUrl.trim().length > 0) {
            return this.customUrl.trim();
        }
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            return this.localWsUrl;
        }
        return this.cloudWsUrl;
    }
};

const SUPABASE_REALTIME_CONFIG = {
    host: 'oispsbtnmehtxcjwjlcr.supabase.co',
    apiKey: 'sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah',
    get wsUrl() {
        return `wss://${this.host}/realtime/v1/websocket?apikey=${this.apiKey}&vsn=1.0.0`;
    }
};

class NetworkManager {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isAuthoritativeMode = false;
        this.serverWsUrl = AUTHORITATIVE_SERVER_CONFIG.getActiveWsUrl();
        this.clientId = this.getOrCreateClientId();
        this.currentTopic = null;
        this.currentLobby = null;
        this.currentRoom = null;
        this.myColor = 'red';
        this.isOnlineMatch = false;
        this._isHostExplicit = false;
        this.peerLastSeen = {};
        this._onlineHeartbeatInterval = null;
        this.currentTurnColor = null;
        this.localTimer = null;
        this.heartbeatTimer = null;
        this.msgRef = 1;
        this.eventSequence = 0;
        this.isRolling = false;
        this.botColors = [];
        this.matchPlayers = [];
        this.lastPingTime = 0;
        this._invisibleMatchmakingTimer = null;
        this._matchmakingRaceCheckTimer = null;
        this._internalMatchmakingTimer = null;
        this._lobbyDiscoveryTimer = null;
        this._pendingServerAction = null;

        // Authoritative Two-Stage 15-Second Turn Timer State Machine
        this.currentTurnSeq = 0;
        this.currentTurnStage = null; // 'ROLL' (Stage A) or 'MOVE' (Stage B)
        this.stageDeadlineMs = 0;
        this.stageActionExecuted = false;
        this.stageTimeoutId = null;
        this.stageIntervalId = null;
        this._lastTickSec = 0;

        // Default Arenas (20-Second Matchmaking Timer)
        this.boards = [
            { id: 'dhaka', name: 'ঢাকা এরিনা (Dhaka Arena)', fee: 1000, winPrize: 3600, icon: '🏛️', waitingCount: 1, remainingSeconds: 20 },
            { id: 'chittagong', name: 'চট্টগ্রাম রয়্যালস (Chattogram)', fee: 2000, winPrize: 7200, icon: '👑', waitingCount: 0, remainingSeconds: 20 },
            { id: 'sylhet', name: 'সিলেট সুপার কিংস (Sylhet)', fee: 5000, winPrize: 18000, icon: '⚡', waitingCount: 0, remainingSeconds: 20 },
            { id: 'cox', name: 'কক্সবাজার গোল্ডেন বিচ (Cox\'s Bazar)', fee: 10000, winPrize: 36000, icon: '🏖️', waitingCount: 0, remainingSeconds: 20 },
            { id: 'padma', name: 'পদ্মা এক্সপ্রেস (Padma Express)', fee: 25000, winPrize: 90000, icon: '🚄', waitingCount: 0, remainingSeconds: 20 }
        ];

        this.init();
    }

    get currentRoomCode() {
        return this.currentRoom?.roomCode || this.currentLobby?.roomCode || 'online_match';
    }

    get isHost() {
        if (!this.isOnlineMatch) {
            return !!this._isHostExplicit;
        }
        return false; // Serverless authoritative: no player on the board is host!
    }

    set isHost(val) {
        this._isHostExplicit = !!val;
    }

    /**
     * Serverless Deterministic PRNG for Bots and AFK Timeouts:
     * Guarantees 100% identical dice roll on all devices for a given turn sequence
     * without relying on any single device to act as host.
     */
    getDeterministicRoll(roomCode, turnSeq) {
        const seedStr = `${roomCode}_turn_${turnSeq}`;
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) {
            hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
            hash |= 0;
        }
        let roll = (Math.abs(hash) % 6) + 1;

        // Respect Rule 4 Immunity: If 4 or 2 lands on an opponent, roll something else!
        const ui = this.getUI();
        if (ui && ui.engine && typeof ui.engine.getForbiddenImmunityDiceValues === 'function') {
            const curP = ui.engine.getCurrentPlayer();
            const forbidden = ui.engine.getForbiddenImmunityDiceValues(curP);
            let attempts = 0;
            while (forbidden.includes(roll) && attempts < 6) {
                hash = ((hash << 5) - hash) + 31;
                hash |= 0;
                roll = (Math.abs(hash) % 6) + 1;
                attempts++;
            }
        }

        return roll;
    }

    isActiveHost() {
        return false;
    }

    isPeerActive(color) {
        if (!color) return false;
        if (color === this.myColor) return true;
        if (!this.peerLastSeen) return false;
        const lastSeen = (this.peerLastSeen[color] !== undefined) ? this.peerLastSeen[color] : (this._matchStartTime || 0);
        return (Date.now() - lastSeen < 6000); // 6 seconds (3 missed heartbeats)
    }

    /**
     * Authoritative Dynamic Active Connected Humans List
     * Returns connected human players in canonical turn order [red, green, yellow, blue]
     */
    getActiveConnectedHumans() {
        const order = ['red', 'green', 'yellow', 'blue'];
        const list = (this.matchPlayers && this.matchPlayers.length > 0) ? this.matchPlayers : (this.getUI()?.engine?.players || []);
        return order.filter(c => {
            const p = list.find(mp => (mp.color === c || mp.id === c));
            if (!p) return false;
            if (this.botColors && this.botColors.includes(c)) return false;
            return this.isPeerActive(c);
        });
    }

    /**
     * Dynamic Self-Healing Bot Leader Check
     * Evaluates whether local player is the designated leader for executing/broadcasting bot turns
     */
    isCurrentBotLeader() {
        const activeHumans = this.getActiveConnectedHumans();
        return activeHumans.length > 0 && activeHumans[0] === this.myColor;
    }

    trackPeerActivity(color) {
        if (!color) return;
        if (!this.peerLastSeen) this.peerLastSeen = {};
        this.peerLastSeen[color] = Date.now();
    }

    startHeartbeat() {
        if (this._onlineHeartbeatInterval) clearInterval(this._onlineHeartbeatInterval);
        if (this.isOnlineMatch && this.myColor) {
            this.broadcast('PEER_HEARTBEAT', { color: this.myColor, id: this.clientId });
        }
        this._onlineHeartbeatInterval = setInterval(() => {
            if (this.isOnlineMatch && this.myColor) {
                this.broadcast('PEER_HEARTBEAT', { color: this.myColor, id: this.clientId });
            }
        }, 2000);
    }

    stopHeartbeat() {
        if (this._onlineHeartbeatInterval) {
            clearInterval(this._onlineHeartbeatInterval);
            this._onlineHeartbeatInterval = null;
        }
    }

    startMatchWatchdog() {
        this.stopMatchWatchdog();
        this._lastTurnActivityTimestamp = Date.now();
        this._matchWatchdogInterval = setInterval(() => {
            if (!this.isOnlineMatch) {
                this.stopMatchWatchdog();
                return;
            }

            const ui = this.getUI();
            if (!ui || !ui.engine) return;

            // Universal Serverless Anti-Freeze Safety Net (> 20s without any turn progress)
            const curTurn = this.currentTurnColor;
            if (!curTurn) return;

            // Instant peer heartbeat/silence check (> 6s silence converts remote player to bot, never interrupts 15s human turn)
            const playerList = (this.matchPlayers && this.matchPlayers.length > 0) ? this.matchPlayers : (ui.engine.players || []);
            if (this.peerLastSeen && playerList) {
                const now = Date.now();
                playerList.forEach(p => {
                    const pColor = p.color || p.id;
                    if (pColor && pColor !== this.myColor && !this.botColors.includes(pColor)) {
                        const lastSeen = this.peerLastSeen[pColor] || 0;
                        if (lastSeen > 0 && (now - lastSeen) > 6000) {
                            console.warn(`[Peer Inactive] Peer ${pColor} silent for ${now - lastSeen}ms. Converting to Bot...`);
                            this.convertPlayerToBot(pColor, p.name);
                        }
                    }
                });
            }

            const turnAge = Date.now() - (this._lastTurnActivityTimestamp || Date.now());
            if (turnAge > 20000) {
                console.warn(`[Anti-Freeze Watchdog] Match stalled on ${curTurn} for ${turnAge}ms! Forcing deterministic recovery...`);
                this._lastTurnActivityTimestamp = Date.now();
                if (ui.engine.state === 'WAITING_ROLL') {
                    this.executeAutoRoll(curTurn, this.currentTurnSeq);
                } else if (ui.engine.state === 'SELECTING_TOKEN') {
                    this.executeAutoMove(curTurn, this.currentTurnSeq);
                } else {
                    this.passTurnToNext(curTurn);
                }
            }
        }, 2000);
    }

    stopMatchWatchdog() {
        if (this._matchWatchdogInterval) {
            clearInterval(this._matchWatchdogInterval);
            this._matchWatchdogInterval = null;
        }
    }

    getOrCreateClientId() {
        let cid = localStorage.getItem('lx_client_id');
        if (!cid) {
            cid = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
            localStorage.setItem('lx_client_id', cid);
        }
        return cid;
    }

    getUI() {
        return window.uiController || window.ludoApp;
    }

    init() {
        this.bindInitialBoardListeners();
        this.bindWaitingRoomUI();
        this.bindRejoinUI();
        this.initServerSettingsUI();
        this.connect();
        this.updateActiveMatchUI();
    }

    initServerSettingsUI() {
        const inputUrl = document.getElementById('inputGameServerUrl');
        const btnSave = document.getElementById('btnSaveGameServerUrl');
        const hostDisplay = document.getElementById('onlineServerHostDisplay');

        if (inputUrl) {
            inputUrl.value = localStorage.getItem('lx_game_server_url') || '';
            inputUrl.placeholder = AUTHORITATIVE_SERVER_CONFIG.cloudWsUrl;
        }

        if (hostDisplay) {
            const current = AUTHORITATIVE_SERVER_CONFIG.getActiveWsUrl();
            hostDisplay.textContent = `সার্ভার: ${current.replace(/^wss?:\/\//, '').split('/')[0]}`;
        }

        if (btnSave && inputUrl) {
            btnSave.addEventListener('click', () => {
                const newUrl = inputUrl.value.trim();
                if (newUrl) {
                    localStorage.setItem('lx_game_server_url', newUrl);
                    this.showToast(`✅ সার্ভার URL সংরক্ষিত হয়েছে: ${newUrl}`);
                } else {
                    localStorage.removeItem('lx_game_server_url');
                    this.showToast('🔄 ডিফল্ট ক্লাউড সার্ভারে রিসেট করা হয়েছে');
                }
                this.serverWsUrl = AUTHORITATIVE_SERVER_CONFIG.getActiveWsUrl();
                if (hostDisplay) {
                    hostDisplay.textContent = `সার্ভার: ${this.serverWsUrl.replace(/^wss?:\/\//, '').split('/')[0]}`;
                }
                if (this.ws) {
                    this.ws.close();
                }
                setTimeout(() => this.connect(), 400);
            });
        }
    }

    isAuthoritativeServerConnected() {
        return this.isConnected && this.isAuthoritativeMode && this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    sendToServer(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        try {
            this.ws.send(JSON.stringify({ type, payload }));
            return true;
        } catch (e) {
            console.error('[Authoritative Server] Send error:', e);
            return false;
        }
    }

    /**
     * Connect to Authoritative Cloud Game Server (with graceful Supabase Realtime fallback)
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const url = this.serverWsUrl || AUTHORITATIVE_SERVER_CONFIG.getActiveWsUrl();
        console.log(`[Authoritative Server] Connecting to ${url}...`);

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log(`[Authoritative Server] Connected successfully to ${url}! 🟢`);
                this.isConnected = true;
                this.isAuthoritativeMode = true;
                this.updateStatusBadge(true, '🟢 অথরিটেটিভ সার্ভার সংযুক্ত');

                const statusEl = document.getElementById('onlineServerStatusText');
                if (statusEl) statusEl.textContent = 'Authoritative Cloud Server Connected';

                // Send profile greeting & fetch boards
                const ui = this.getUI();
                const myName = ui?.userStats?.name || localStorage.getItem('lx_player_name') || 'খেলোয়াড়';
                const myAvatar = ui?.userStats?.avatar || 'king';

                this.sendToServer('SET_PROFILE', { name: myName, avatar: myAvatar });
                this.sendToServer('GET_BOARDS');

                // Dispatch any queued server action (e.g. JOIN_BOARD, CREATE_PRIVATE_ROOM, JOIN_PRIVATE_ROOM)
                if (this._pendingServerAction) {
                    const action = this._pendingServerAction;
                    this._pendingServerAction = null;
                    setTimeout(() => {
                        console.log(`[Authoritative Server] Dispatching queued action:`, action);
                        this.sendToServer(action.type, action.payload);
                    }, 120);
                }

                // Ping every 15s to measure live latency
                if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = setInterval(() => {
                    this.lastPingTime = Date.now();
                    if (this.isAuthoritativeMode) {
                        this.sendToServer('PING');
                    } else {
                        this.sendHeartbeat();
                    }
                }, 15000);

                // Render default boards
                this.renderBoardsList(this.boards);
            };

            this.ws.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data);
                    // Authoritative Server message
                    if (packet.type) {
                        this.isAuthoritativeMode = true;
                        this.handleAuthoritativeServerMessage(packet.type, packet.payload);
                        return;
                    }
                    // Phoenix / Supabase Realtime channel fallback
                    if (packet.event) {
                        this.handlePhoenixMessage(packet);
                    }
                } catch (e) {
                    console.warn('[Authoritative Server] Packet parse error:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('[Authoritative Server] Disconnected 🔴. Reconnecting in 3s...');
                this.isConnected = false;
                this.isAuthoritativeMode = false;
                if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
                this.updateStatusBadge(false, '🔴 সংযোগ বিচ্ছিন্ন');

                const statusEl = document.getElementById('onlineServerStatusText');
                if (statusEl) statusEl.textContent = 'Disconnected (Reconnecting...)';

                setTimeout(() => this.connect(), 3000);
            };

            this.ws.onerror = (err) => {
                console.warn('[Authoritative Server] Socket error:', err);
                this.isConnected = false;
                this.updateStatusBadge(false, '⚠️ সার্ভার ত্রুটি');
            };
        } catch (e) {
            console.error('[Authoritative Server] Connect exception:', e);
            this.isConnected = false;
            this.updateStatusBadge(false, '🔴 সংযোগ ব্যর্থ');
        }
    }

    handleAuthoritativeServerMessage(type, payload = {}) {
        const ui = this.getUI();

        switch (type) {
            case 'CONNECTED':
                this.clientId = payload.clientId;
                console.log(`[Authoritative Server] Registered Client ID: ${this.clientId}`);
                break;

            case 'BOARD_LIST':
                if (Array.isArray(payload.boards) && payload.boards.length > 0) {
                    this.boards = payload.boards;
                    this.renderBoardsList(this.boards);
                }
                break;

            case 'LOBBY_JOINED':
                this.currentLobby = payload;
                this.myColor = payload.myColor || this.myColor;
                this.isHost = (payload.boardId === 'private' && payload.players && payload.players[0] && payload.players[0].id === this.clientId);
                this.openWaitingRoom(payload);
                break;

            case 'PRIVATE_ROOM_CREATED':
                this.currentLobby = payload;
                this.myColor = payload.myColor || 'red';
                this.isHost = true;
                const inputCodeEl = document.getElementById('inputRoomCode');
                if (inputCodeEl) inputCodeEl.value = payload.roomCode;
                this.openWaitingRoom(payload);
                this.showToast(`🎉 প্রাইভেট রুম #${payload.roomCode} তৈরি হয়েছে! বন্ধুদের বলুন জয়েন করতে।`);
                break;

            case 'PLAYER_JOINED_LOBBY':
                if (payload.players) {
                    if (this.currentLobby) this.currentLobby.players = payload.players;
                    this.updateWaitingRoomSlots(payload.players);
                    window.soundFX?.playClick();
                }
                break;

            case 'PLAYER_LEFT_LOBBY':
                if (payload.players) {
                    if (this.currentLobby) this.currentLobby.players = payload.players;
                    this.updateWaitingRoomSlots(payload.players);
                }
                break;

            case 'LOBBY_TICK':
                if (this.currentLobby) {
                    this.currentLobby.remainingSeconds = payload.remainingSeconds;
                }
                this.updateCountdownDisplay(payload.remainingSeconds);
                break;

            case 'MATCH_STARTED':
                if (this._lobbyDiscoveryTimer) {
                    clearTimeout(this._lobbyDiscoveryTimer);
                    this._lobbyDiscoveryTimer = null;
                }
                if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
                this.isOnlineMatch = true;
                this.isHost = false; // Sole authoritative host is the cloud server!
                this.currentRoom = payload;
                this.startOnlineMatch(payload);
                break;

            case 'DICE_ROLLED':
                this.clearTurnTimers();
                this.handleRemoteDiceRolled(payload);
                break;

            case 'TOKEN_MOVED':
                this.clearTurnTimers();
                this.handleRemoteTokenMoved(payload);
                break;

            case 'TURN_CHANGED':
                this.handleTurnChanged(payload.nextTurn);
                break;

            case 'TURN_STAGE_SYNC':
                this.handleTurnStageSync(payload);
                break;

            case 'TURN_TIMEOUT':
                this.showToast(`⏰ সময় শেষ! ${payload.timedOutColor.toUpperCase()}-এর চাল স্বয়ংক্রিয়ভাবে পাস হয়েছে।`);
                break;

            case 'PLAYER_STATUS_CHANGED':
                if (payload.color === this.myColor) {
                    this.updateAutoPlayUI(payload.autoPlay);
                    if (payload.autoPlay) {
                        this.showToast('🤖 ১৫ সেকেন্ডে চাল না দেওয়ায় বট দায়িত্ব নিয়েছে। Auto Play OFF করতে ট্যাপ করুন।');
                    } else {
                        this.showToast('🎮 আপনি পুনরায় ম্যানুয়াল কন্ট্রোল ফিরে পেয়েছেন!');
                    }
                }
                if (payload.autoPlay) {
                    if (!this.botColors.includes(payload.color)) this.botColors.push(payload.color);
                } else {
                    this.botColors = this.botColors.filter(c => c !== payload.color);
                }
                if (ui && ui.engine && ui.engine.players) {
                    const p = ui.engine.players.find(p => p.id === payload.color);
                    if (p) p.isAI = payload.autoPlay || payload.isBot;
                    if (typeof ui.updatePlayerPods === 'function') ui.updatePlayerPods();
                }
                break;

            case 'MATCH_REJOINED':
                console.log(`[Authoritative Server] Successfully rejoined match #${payload.roomCode}!`);
                this.isOnlineMatch = true;
                this.isHost = false;
                this.myColor = payload.myColor;
                this.closeWaitingRoom();
                this.applySynchronizedState(payload.snapshot);
                this.showToast('🎉 ম্যাচে সফলভাবে পুনরায় সংযুক্ত হয়েছেন!');
                break;

            case 'PLAYER_REJOINED_MATCH':
                this.showToast(`🎉 ${payload.name || payload.color.toUpperCase()} পুনরায় ম্যাচে যোগ দিয়েছেন!`);
                break;

            case 'EMOTE_RECEIVED':
                this.showFloatingEmote(payload.color, payload.emoji);
                break;

            case 'NOTICE':
                this.showToast(payload.message || 'বিজ্ঞপ্তি');
                break;

            case 'PONG':
                if (this.lastPingTime) {
                    const ping = Date.now() - this.lastPingTime;
                    const pingEl = document.getElementById('onlineLivePing');
                    if (pingEl) pingEl.textContent = `${ping}ms`;
                }
                break;
        }
    }

    sendHeartbeat() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.lastPingTime = Date.now();
        const ref = String(this.msgRef++);
        this.sendRaw({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: ref
        });
    }

    sendRaw(msgObj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(msgObj));
        return true;
    }

    /**
     * Join a Supabase Realtime channel
     */
    joinTopic(topicName) {
        if (this.currentTopic === topicName) {
            console.log(`[Supabase Realtime] Channel ${topicName} already active, keeping connection open! 🟢`);
            return true;
        }
        if (this.currentTopic && this.currentTopic !== topicName) {
            this.leaveCurrentTopic();
        }

        this.currentTopic = topicName;
        const ref = String(this.msgRef++);
        console.log(`[Supabase Realtime] Joining channel: ${topicName}`);

        return this.sendRaw({
            topic: topicName,
            event: 'phx_join',
            payload: {
                config: {
                    broadcast: { self: false },
                    presence: { key: this.clientId }
                }
            },
            ref: ref,
            join_ref: ref
        });
    }

    leaveCurrentTopic() {
        if (!this.currentTopic) return;
        const ref = String(this.msgRef++);
        this.sendRaw({
            topic: this.currentTopic,
            event: 'phx_leave',
            payload: {},
            ref: ref
        });
        console.log(`[Supabase Realtime] Left channel: ${this.currentTopic}`);
        this.currentTopic = null;
    }

    /**
     * Broadcast game event to all peers on the active Supabase channel
     */
    broadcast(type, payloadData = {}) {
        if (!this.currentTopic) return false;

        const ref = String(this.msgRef++);
        const packet = {
            topic: this.currentTopic,
            event: 'broadcast',
            payload: {
                type: 'broadcast',
                event: 'GAME_EVENT',
                payload: {
                    type: type,
                    senderId: this.clientId,
                    senderColor: this.myColor,
                    seq: ++this.eventSequence,
                    timestamp: Date.now(),
                    ...payloadData
                }
            },
            ref: ref
        };

        return this.sendRaw(packet);
    }

    handlePhoenixMessage(msg) {
        if (msg.event === 'phx_reply') {
            if (msg.topic === 'phoenix' && this.lastPingTime) {
                const ping = Date.now() - this.lastPingTime;
                const pingEl = document.getElementById('onlineLivePing');
                if (pingEl) {
                    pingEl.textContent = `${ping}ms`;
                    pingEl.style.color = (ping < 120) ? '#22c55e' : (ping < 250 ? '#facc15' : '#ef4444');
                }
            } else if (msg.topic && msg.topic.startsWith('realtime:ludo_room_') && msg.payload?.response?.status === 'ok') {
                // Send Phoenix Presence Track packet so Supabase Realtime tracks this client's presence and emits presence_diff on disconnect
                const ref = String(this.msgRef++);
                this.sendRaw({
                    topic: msg.topic,
                    event: 'presence',
                    payload: {
                        type: 'presence',
                        event: 'track',
                        payload: {
                            clientId: this.clientId,
                            color: this.myColor,
                            name: this.getUI()?.userStats?.name || 'Player',
                            onlineAt: Date.now()
                        }
                    },
                    ref: ref
                });
            }
            return;
        }

        // Phoenix Presence Event: Instant notification when any client leaves (app closed, network drop) or rejoins
        if (msg.event === 'presence_diff') {
            const leaves = msg.payload?.leaves || {};
            const joins = msg.payload?.joins || {};

            for (const leftClientId of Object.keys(leaves)) {
                if (leftClientId === this.clientId) continue;
                this.handleClientPresenceLeft(leftClientId);
            }

            for (const joinedClientId of Object.keys(joins)) {
                if (joinedClientId === this.clientId) continue;
                this.handleClientPresenceJoined(joinedClientId);
            }
            return;
        }

        if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'GAME_EVENT') {
            const eventData = msg.payload.payload;
            if (!eventData || eventData.senderId === this.clientId) return; // Prevent echo loop
            this.handleGameEvent(eventData);
        }
    }

    handleClientPresenceLeft(clientId) {
        if (!this.isOnlineMatch) return;
        const player = this.matchPlayers?.find(p => p.id === clientId);
        if (player && player.color) {
            console.log(`[Instant Bot Takeover] Client ${clientId} (${player.color}) disconnected via socket drop. Converting to bot...`);
            if (this.peerLastSeen) this.peerLastSeen[player.color] = 0;
            this.convertPlayerToBot(player.color, player.name);
        }
    }

    handleClientPresenceJoined(clientId) {
        if (!this.isOnlineMatch) return;
        const player = this.matchPlayers?.find(p => p.id === clientId);
        if (player && player.color) {
            console.log(`[Player Rejoined] Client ${clientId} (${player.color}) reconnected via socket. Restoring human control...`);
            this.restoreBotToPlayer(player.color, player.name);
        }
    }

    /**
     * Instantly converts a disconnected or timed-out player slot to a bot
     * If currently that player's turn, executes bot turn immediately without hanging!
     */
    convertPlayerToBot(color, playerName = null, isFromStageTimeout = false) {
        if (!color) return;
        if (!this.botColors) this.botColors = [];
        if (!this.botColors.includes(color)) {
            this.botColors.push(color);
        }

        const ui = this.getUI();
        if (ui && ui.engine && ui.engine.players) {
            const p = ui.engine.players.find(pl => pl.id === color);
            if (p) p.isAI = true;
            if (typeof ui.updatePlayerPods === 'function') {
                ui.updatePlayerPods();
            }
        }

        if (color === this.myColor) {
            this.updateAutoPlayUI(true);
            this.showToast('⏰ ১৫ সেকেন্ড পার হয়েছে! আপনার জন্য রোবট খেলছে। যেকোনো সময় অটো প্লে বন্ধ করতে পারেন।');
        } else {
            const displayName = playerName || color.toUpperCase();
            this.showToast(`🤖 ${displayName}-এর জন্য এখন রোবট খেলছে।`);
        }

        // If it is CURRENTLY that player's turn and NOT already invoked from a stage timeout:
        // (Stage timeout handlers execute executeAutoRoll or executeAutoMove immediately without delay)
        if (!isFromStageTimeout && this.currentTurnColor === color) {
            console.log(`[Instant Bot Takeover] Player ${color} is currently active. Executing bot turn immediately...`);
            this.clearTurnTimers();
            setTimeout(() => {
                if (this.isOnlineMatch && this.currentTurnColor === color) {
                    if (ui?.engine?.state === 'WAITING_ROLL') {
                        this.executeDeterministicBotTurn(color);
                    } else if (ui?.engine?.state === 'SELECTING_TOKEN' && ui?.engine?.diceValue > 0) {
                        this.executeAutoMove(color, this.currentTurnSeq);
                    }
                }
            }, 400);
        }
    }

    /**
     * Restores human control when a player reconnects or turns off Auto Play
     */
    restoreBotToPlayer(color, playerName = null) {
        if (!color) return;
        if (this.botColors) {
            this.botColors = this.botColors.filter(c => c !== color);
        }
        if (this.peerLastSeen) {
            this.peerLastSeen[color] = Date.now();
        }

        // Clear any scheduled bot rolls for this color
        if (this.currentTurnColor === color && this.botRollTimeout) {
            clearTimeout(this.botRollTimeout);
            this.botRollTimeout = null;
        }

        const ui = this.getUI();
        if (ui && ui.engine && ui.engine.players) {
            const p = ui.engine.players.find(pl => pl.id === color);
            if (p) p.isAI = false;
            if (typeof ui.updatePlayerPods === 'function') {
                ui.updatePlayerPods();
            }
        }

        if (color === this.myColor) {
            this.updateAutoPlayUI(false);
            this.showToast('🎮 অটো প্লে বন্ধ হয়েছে! এখন আপনি নিজে খেলছেন।');
            // If it is currently my turn, unlock dice box & start 15s turn timer!
            if (this.currentTurnColor === this.myColor) {
                const box = document.getElementById(`dice_box_${this.myColor}`);
                if (box) {
                    box.style.pointerEvents = 'auto';
                    box.style.cursor = 'pointer';
                }
                const banner = document.getElementById('turnBanner');
                if (banner) {
                    banner.textContent = '👉 আপনার চাল! ডাইসে চাপ দিন';
                }
                if (ui?.engine?.state === 'WAITING_ROLL') {
                    this.startStageADiceRoll(this.myColor, ++this.currentTurnSeq);
                } else if (ui?.engine?.state === 'SELECTING_TOKEN') {
                    this.startStageBTokenMove(this.myColor, this.currentTurnSeq);
                }
            }
        } else {
            const displayName = playerName || color.toUpperCase();
            this.showToast(`🎉 ${displayName} নিজে খেলা শুরু করেছেন!`);
        }
    }

    /**
     * Toggle Auto Play On/Off for the local player
     */
    toggleAutoPlay() {
        if (!this.isOnlineMatch) {
            const ui = this.getUI();
            if (ui) {
                ui.autoPlay = !ui.autoPlay;
                this.updateAutoPlayUI(ui.autoPlay);
                if (ui.autoPlay) ui.checkAITurn();
            }
            return;
        }

        const isCurrentlyBot = (this.botColors && this.botColors.includes(this.myColor));

        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('SET_AUTO_PLAY', { enabled: !isCurrentlyBot });
            return;
        }

        if (isCurrentlyBot) {
            // Player wants to turn Auto Play OFF and take back control!
            console.log(`[Auto Play] Resuming manual control for ${this.myColor}`);
            this.restoreBotToPlayer(this.myColor);
            this.broadcast('PLAYER_RESUMED_MANUAL', { color: this.myColor });
        } else {
            // Player manually turned Auto Play ON!
            console.log(`[Auto Play] Manual Auto Play enabled for ${this.myColor}`);
            this.convertPlayerToBot(this.myColor);
            this.broadcast('PLAYER_TIMEOUT_BOT', { color: this.myColor });
        }
    }

    /**
     * Synchronize Auto Play UI buttons, pills & settings
     */
    updateAutoPlayUI(isActive) {
        const btnAutoPlay = document.getElementById('btnAutoPlay');
        if (btnAutoPlay) {
            btnAutoPlay.classList.toggle('active', isActive);
            btnAutoPlay.style.borderColor = isActive ? '#22c55e' : '';
            btnAutoPlay.style.background = isActive ? 'rgba(34, 197, 94, 0.25)' : '';
            btnAutoPlay.title = isActive ? 'অটো প্লে চালু আছে (ক্লিক করে বন্ধ করুন)' : 'অটো প্লে / স্বয়ংক্রিয় খেলা';
        }
        const pill = document.getElementById('autoPlayActivePill');
        if (pill) {
            pill.style.display = isActive ? 'inline-flex' : 'none';
        }
        const toggleSettings = document.getElementById('toggleAutoPlaySettings');
        if (toggleSettings) {
            toggleSettings.textContent = isActive ? 'চালু (ON)' : 'বন্ধ (OFF)';
            toggleSettings.classList.toggle('active', isActive);
        }
        const sideBtnAuto = document.getElementById('sideBtnAutoPlay');
        if (sideBtnAuto) {
            sideBtnAuto.textContent = `🤖 Auto Play: ${isActive ? 'ON' : 'OFF'}`;
        }
    }

    handleGameEvent(data) {
        if (!data) return;
        try {
            if (data.color) this.trackPeerActivity(data.color);
            if (data.fromColor) this.trackPeerActivity(data.fromColor);
            if (data.senderColor) this.trackPeerActivity(data.senderColor);

            switch (data.type) {
            case 'PEER_HEARTBEAT':
                if (data.color) this.trackPeerActivity(data.color);
                break;
            case 'PLAYER_JOINED_ROOM': {
                if (!this.currentLobby || !data.players) return;
                console.log('[Matchmaking] PLAYER_JOINED_ROOM received. Player count:', data.players.length);
                this.currentLobby.players = data.players;
                this.updateWaitingRoomSlots(data.players);

                const me = data.players.find(p => p.id === this.clientId);
                if (me) {
                    this.myColor = me.color;
                    this.isHost = !!me.isHost;
                }

                // If 4 human players have joined: Start immediately!
                if (data.players.length >= 4 && !this.isOnlineMatch) {
                    console.log('[Matchmaking] 4 Human players joined! Starting match immediately!');
                    this.lockAndStartMatch(this.currentLobby.roomCode, data.players);
                }
                break;
            }

            case 'FORCE_START_NOW':
            case 'MATCH_STARTED': {
                console.log('[Matchmaking] Start signal received via WebSocket!');
                if (this._waitingRoomSyncInterval) {
                    clearInterval(this._waitingRoomSyncInterval);
                    this._waitingRoomSyncInterval = null;
                }
                const payload = data.matchPayload || data;
                if (!this.isOnlineMatch && payload && Array.isArray(payload.players)) {
                    this.isOnlineMatch = true;
                    if (payload.roomCode) {
                        this.joinTopic(`realtime:ludo_room_${payload.roomCode}`);
                    }
                    this.startOnlineMatch(payload);
                }
                break;
            }

            case 'REQUEST_JOIN_LOBBY': {
                if (!this.isHost || !this.currentLobby) return;
                const newPlayer = data.player;
                if (!newPlayer || !newPlayer.id) return;

                // Check if lobby is already full (max 4 players)
                if (this.currentLobby.players.length >= 4) {
                    this.broadcast('ROOM_FULL', { targetId: newPlayer.id });
                    return;
                }

                // If player is already in lobby, re-sync state
                const existingIdx = this.currentLobby.players.findIndex(p => p.id === newPlayer.id);
                if (existingIdx !== -1) {
                    this.broadcast('LOBBY_STATE_SYNC', {
                        players: this.currentLobby.players,
                        remainingSeconds: this.currentLobby.remainingSeconds,
                        boardName: this.currentLobby.boardName,
                        roomCode: this.currentLobby.roomCode || null
                    });
                    return;
                }

                // Assign next untaken color: red -> green -> yellow -> blue
                const allColors = ['red', 'green', 'yellow', 'blue'];
                const takenColors = this.currentLobby.players.map(p => p.color);
                const assignedColor = allColors.find(c => !takenColors.includes(c)) || 'blue';

                const playerEntry = {
                    id: newPlayer.id,
                    name: newPlayer.name || 'প্লেয়ার',
                    avatar: newPlayer.avatar || 'king',
                    color: assignedColor,
                    isHost: false
                };

                this.currentLobby.players.push(playerEntry);
                this.updateWaitingRoomSlots(this.currentLobby.players);
                window.soundFX?.playClick();

                // Broadcast authoritative state to all clients
                this.broadcast('LOBBY_STATE_SYNC', {
                    players: this.currentLobby.players,
                    boardName: this.currentLobby.boardName,
                    roomCode: this.currentLobby.roomCode || null
                });

                // SCENARIO A: 4 Human Players Occupy Slots -> Start Match IMMEDIATELY!
                if (this.currentLobby.players.length === 4) {
                    console.log('[Matchmaking] 4 Human players joined! Starting match immediately!');
                    if (this._internalMatchmakingTimer) {
                        clearTimeout(this._internalMatchmakingTimer);
                        this._internalMatchmakingTimer = null;
                    }
                    setTimeout(() => {
                        this.forceStartMatch();
                    }, 50);
                }
                break;
            }

            case 'LOBBY_STATE_SYNC': {
                if (this._lobbyDiscoveryTimer) {
                    clearTimeout(this._lobbyDiscoveryTimer);
                    this._lobbyDiscoveryTimer = null;
                }
                if (this.currentLobby && data.players) {
                    this.currentLobby.players = data.players;
                    
                    // Identify self in players list
                    const me = data.players.find(p => p.id === this.clientId);
                    if (me) {
                        this.myColor = me.color;
                        this.isHost = !!me.isHost;
                    }

                    this.updateWaitingRoomSlots(this.currentLobby.players);

                    // SCENARIO A: Host immediately triggers match start if 4 players are present
                    if (this.isHost && this.currentLobby.players.length === 4 && !this.isOnlineMatch) {
                        console.log('[Matchmaking] 4 Human players present on sync! Starting match immediately!');
                        if (this._internalMatchmakingTimer) {
                            clearTimeout(this._internalMatchmakingTimer);
                            this._internalMatchmakingTimer = null;
                        }
                        setTimeout(() => {
                            this.forceStartMatch();
                        }, 50);
                    }
                }
                break;
            }

            case 'ROOM_FULL': {
                if (data.targetId === this.clientId) {
                    alert('এই রুমটি পূর্ণ হয়ে গেছে (৪/৪ প্লেয়ার)! অনুগ্রহ করে অন্য রুমে চেষ্টা করুন।');
                    this.leaveLobby();
                }
                break;
            }

            case 'PLAYER_LEFT_LOBBY': {
                if (this.isHost && this.currentLobby) {
                    this.currentLobby.players = this.currentLobby.players.filter(p => p.id !== data.playerId);
                    this.updateWaitingRoomSlots(this.currentLobby.players);
                    this.broadcast('LOBBY_STATE_SYNC', {
                        players: this.currentLobby.players,
                        remainingSeconds: this.currentLobby.remainingSeconds,
                        boardName: this.currentLobby.boardName,
                        roomCode: this.currentLobby.roomCode || null
                    });
                }
                break;
            }

            case 'PLAYER_LEFT_MATCH': {
                if (this.isOnlineMatch && data.color) {
                    this.convertPlayerToBot(data.color, data.playerName);
                }
                break;
            }

            case 'PLAYER_TIMEOUT_BOT': {
                if (this.isOnlineMatch && data.color) {
                    this.convertPlayerToBot(data.color, data.playerName);
                }
                break;
            }

            case 'PLAYER_RESUMED_MANUAL': {
                if (this.isOnlineMatch && data.color) {
                    this.restoreBotToPlayer(data.color, data.playerName);
                }
                break;
            }

            case 'MATCH_STARTED':
                if (this._lobbyDiscoveryTimer) {
                    clearTimeout(this._lobbyDiscoveryTimer);
                    this._lobbyDiscoveryTimer = null;
                }
                if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
                this.isOnlineMatch = true;
                // Maintain persistent room topic (no reconnect drops)
                if (data.roomCode) {
                    this.joinTopic(`realtime:ludo_room_${data.roomCode}`);
                }
                this.startOnlineMatch(data);
                break;

            case 'TURN_STAGE_SYNC':
                this.handleTurnStageSync(data);
                break;

            case 'DICE_ROLLED':
                this.clearTurnTimers();
                this.handleRemoteDiceRolled(data);
                break;

            case 'TOKEN_MOVED':
                this.clearTurnTimers();
                this.handleRemoteTokenMoved(data);
                break;

            case 'TURN_CHANGED':
                this.handleTurnChanged(data.nextTurn);
                break;

            case 'TURN_TIMEOUT':
                this.showToast(`⏰ সময় শেষ! ${data.timedOutColor.toUpperCase()}-এর চাল পাস হয়েছে।`);
                break;

            case 'EMOTE_RECEIVED':
                this.showFloatingEmote(data.color, data.emoji);
                break;

            case 'REQUEST_MATCH_STATE': {
                if (!this.isOnlineMatch) return;
                const ui = this.getUI();
                if (ui && ui.engine && ui.engine.players) {
                    // Designate single responder to prevent network flooding and race conditions:
                    // Preferred: Current turn player (if active and not rejoining), OR the authoritative dynamic Bot Leader.
                    const isDesignated = (this.currentTurnColor === this.myColor && this.myColor !== data.rejoiningColor) ||
                        (this.isCurrentBotLeader() && this.currentTurnColor !== this.myColor);

                    if (!isDesignated) {
                        return;
                    }

                    const statePayload = {
                        targetId: data.rejoiningPlayerId,
                        tokens: ui.engine.players.map(p => ({
                            id: p.id,
                            finishedTokens: p.finishedTokens,
                            rank: p.rank,
                            tokens: p.tokens.map(t => ({
                                id: t.id,
                                state: t.state,
                                stepCount: (t.stepCount !== undefined ? t.stepCount : (t.step || 0)),
                                step: (t.stepCount !== undefined ? t.stepCount : (t.step || 0)),
                                trackIndex: t.trackIndex,
                                homePathIndex: t.homePathIndex,
                                hasShield: !!t.hasShield
                            }))
                        })),
                        botColors: this.botColors || [],
                        currentTurnColor: this.currentTurnColor,
                        currentTurnSeq: this.currentTurnSeq,
                        currentTurnStage: this.currentTurnStage,
                        stageDeadline: this.stageDeadlineMs || null,
                        lastDiceValue: (ui.engine.diceValue || this.lastDiceValue || 0)
                    };
                    this.broadcast('MATCH_STATE_SYNC', statePayload);
                }
                break;
            }

            case 'MATCH_STATE_SYNC': {
                if (data.targetId && data.targetId !== this.clientId) return;
                if (data.senderId === this.clientId) return;
                console.log('[Supabase Realtime] Received MATCH_STATE_SYNC from peer');
                this.applySynchronizedState(data);
                break;
            }

            case 'PLAYER_REJOINED_MATCH': {
                if (this.isOnlineMatch && data.color) {
                    const displayName = data.playerName || data.color.toUpperCase();
                    this.showToast(`🎉 ${displayName} পুনরায় ম্যাচে যোগ দিয়েছেন!`);
                }
                break;
            }
        }
        } catch (err) {
            console.error('[Supabase Realtime] Error handling game event:', data?.type, err);
        }
    }

    // -------------------------------------------------------------
    // Online Boards & Arena Selection
    // -------------------------------------------------------------
    bindInitialBoardListeners() {
        const attach = () => {
            const cards = document.querySelectorAll('.online-board-card');
            cards.forEach(card => {
                if (card.dataset.bound === 'true') return;
                card.dataset.bound = 'true';
                const boardId = card.getAttribute('data-board') || 'dhaka';
                const feeText = card.querySelector('.board-fee')?.textContent || '500';
                const fee = parseInt(feeText.replace(/[^0-9]/g, ''), 10) || 500;

                const onCardClick = (e) => {
                    e.stopPropagation();
                    window.soundFX?.playClick();
                    this.joinBoard(boardId, fee);
                };

                card.addEventListener('click', onCardClick);
                const btn = card.querySelector('button');
                if (btn) btn.addEventListener('click', onCardClick);
            });
            this.initOnlineEmoteDock();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attach);
        } else {
            attach();
        }
    }

    initOnlineEmoteDock() {
        const btnToggle = document.getElementById('btnToggleOnlineEmotes');
        const dock = document.getElementById('onlineEmoteDock');
        const btnClose = document.getElementById('btnCloseEmoteDock');

        if (btnToggle && dock) {
            btnToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                window.soundFX?.playClick();
                dock.style.display = (dock.style.display === 'none' || !dock.style.display) ? 'block' : 'none';
            });
        }

        if (btnClose && dock) {
            btnClose.addEventListener('click', () => {
                dock.style.display = 'none';
            });
        }

        document.querySelectorAll('.emote-dock-emojis .emote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.getAttribute('data-emoji') || '🎲';
                window.soundFX?.playClick();
                this.sendEmote(emoji);
                if (dock) dock.style.display = 'none';
            });
        });

        document.querySelectorAll('.emote-dock-phrases .phrase-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const phrase = btn.getAttribute('data-phrase') || '👋';
                window.soundFX?.playClick();
                this.sendEmote(phrase);
                if (dock) dock.style.display = 'none';
            });
        });
    }

    renderBoardsList(boards) {
        const container = document.getElementById('onlineBoardsList');
        if (!container || !boards || boards.length === 0) return;

        const activeMatch = this.getActiveMatchSession();
        container.innerHTML = '';
        boards.forEach(b => {
            const isThisActive = activeMatch && (activeMatch.boardId === b.id);
            const card = document.createElement('div');
            card.className = 'online-board-card' + (isThisActive ? ' active-match-card-glow' : '');
            card.setAttribute('data-board', b.id);
            card.dataset.bound = 'true';

            const tagHtml = isThisActive
                ? '<span class="board-live-tag" style="color: #22c55e;">🟢 <strong>আপনার ম্যাচ চলছে (ক্লিক করে পুনরায় যোগ দিন)</strong></span>'
                : '<span class="board-live-tag">⚡ সুপাবেজ ক্লাউড এরিনা (১৫ সেকেন্ড টাইমার)</span>';

            const btnText = isThisActive ? 'পুনরায় প্রবেশ 🚀' : 'প্রবেশ';

            card.innerHTML = `
                <div class="board-card-left">
                    <div class="board-card-icon">${b.icon || '🏛️'}</div>
                    <div class="board-card-info">
                        <h4>${b.name}</h4>
                        <span class="board-fee">🪙 ${b.fee.toLocaleString()} কয়েন এন্ট্রি • পুরস্কার: ${b.winPrize.toLocaleString()}</span>
                        ${tagHtml}
                    </div>
                </div>
                <button class="btn-small-gold">${btnText}</button>
            `;

            const onSelect = () => {
                window.soundFX?.playClick();
                this.joinBoard(b.id, b.fee);
            };

            card.addEventListener('click', onSelect);
            const btn = card.querySelector('button');
            if (btn) btn.addEventListener('click', onSelect);

            container.appendChild(card);
        });
    }

    // ============================================================
    // Unified Global Online Matchmaking & Room Management
    // ============================================================

    /**
     * Deduct entry fee idempotently and sync with Supabase
     */
    deductEntryFee(roomCode, feeAmount = 500) {
        const fee = (feeAmount !== undefined && feeAmount !== null) ? feeAmount : 500;
        if (fee <= 0) return true;
        const feeTxKey = `lx_fee_${roomCode}`;
        if (localStorage.getItem(feeTxKey)) {
            console.log(`[Economy] Entry fee already deducted for room ${roomCode}. Skipping.`);
            return true;
        }

        const ui = this.getUI();
        const currentCoins = ui?.userStats?.coins || 0;
        if (currentCoins < fee) {
            return false;
        }

        // Record transaction key
        localStorage.setItem(feeTxKey, JSON.stringify({
            roomCode: roomCode,
            amount: fee,
            deductedAt: Date.now()
        }));

        if (typeof ui.addCoins === 'function') {
            ui.addCoins(-fee);
        } else if (ui?.userStats) {
            ui.userStats.coins -= fee;
            localStorage.setItem('lx_coins', String(ui.userStats.coins));
            if (typeof ui.updateCoinsDisplay === 'function') ui.updateCoinsDisplay();
        }

        // Real-time Cloud Save: Sync with Supabase Database!
        if (window.supabaseClient && ui?.userStats) {
            window.supabaseClient.syncProfile(ui.userStats, ui.inventory, true);
        }

        console.log(`[Economy] Deducted ${fee} coins for room ${roomCode} and synced to Supabase`);
        return true;
    }

    /**
     * Award final online match prizes idempotently:
     * 1st Place Human: 10,000 coins
     * 2nd Place Human: 5,000 coins
     * 3rd & 4th: 0 coins
     * Bots: NEVER receive coins (prize is not transferred)
     */
    awardOnlineMatchPrizes(winners) {
        if (!this.isOnlineMatch && !this.getActiveMatchSession()) return;
        const session = this.currentRoom || this.getActiveMatchSession();
        const roomCode = session?.roomCode || this.currentRoomCode || 'online_match';
        const myCol = (this.myColor || 'red').toLowerCase();
        const ui = this.getUI();
        if (!ui || !Array.isArray(winners) || winners.length === 0) return;

        console.log(`[Economy] Evaluating prizes for room ${roomCode}. Winners:`, winners);

        // Find rank of my color (1 = 1st, 2 = 2nd)
        const myRankIndex = winners.findIndex(col => col && col.toLowerCase() === myCol);
        if (myRankIndex === -1) {
            console.log(`[Economy] Player ${myCol} did not finish in top positions.`);
            return;
        }

        const rank = myRankIndex + 1; // 1 = 1st, 2 = 2nd
        let prizeCoins = 0;
        if (rank === 1) {
            prizeCoins = 10000;
        } else if (rank === 2) {
            prizeCoins = 5000;
        } else {
            prizeCoins = 0;
        }

        if (prizeCoins <= 0) return;

        // Verify if I was an AI bot (bots NEVER receive coins)
        if (this.botColors && this.botColors.includes(myCol)) {
            console.log(`[Economy] Color ${myCol} is an AI bot. Bots never receive coins.`);
            return;
        }

        // Idempotent Transaction Key Check (Prevent duplicate payouts)
        const rewardTxKey = `lx_reward_${roomCode}_rank${rank}`;
        if (localStorage.getItem(rewardTxKey)) {
            console.warn(`[Economy] Reward already claimed for room ${roomCode} rank ${rank}! Skipping duplicate.`);
            return;
        }

        localStorage.setItem(rewardTxKey, JSON.stringify({
            roomCode: roomCode,
            rank: rank,
            amount: prizeCoins,
            claimedAt: Date.now()
        }));

        console.log(`[Economy] Awarding rank ${rank} prize of ${prizeCoins} coins to ${myCol} (idempotent key: ${rewardTxKey})`);
        if (typeof ui.addCoins === 'function') {
            ui.addCoins(prizeCoins);
        } else if (ui?.userStats) {
            ui.userStats.coins += prizeCoins;
            localStorage.setItem('lx_coins', String(ui.userStats.coins));
            if (typeof ui.updateCoinsDisplay === 'function') ui.updateCoinsDisplay();
        }

        // Real-time Cloud Save: Sync with Supabase Database!
        if (window.supabaseClient && ui?.userStats) {
            window.supabaseClient.recordMatchResult({
                roomCode: roomCode,
                isWinner: (rank === 1),
                coinsWon: prizeCoins,
                mode: 'ONLINE_MULTIPLAYER'
            });
            window.supabaseClient.syncProfile(ui.userStats, ui.inventory, false);
        }
        this.showToast(`🎉 অভিনন্দন! আপনি ${rank === 1 ? '১ম' : '২য়'} স্থান অর্জন করে ${prizeCoins.toLocaleString()} কয়েন জিতেছেন!`);
    }

    /**
     * Query Supabase for active open waiting rooms (< 20s old, < 4 players)
     */
    async findOpenWaitingRoom() {
        if (!window.supabaseClient) return null;
        try {
            // Always query newest rooms first (descending created_at)
            const res = await window.supabaseClient.request(
                '/rest/v1/match_history?mode=eq.ONLINE_WAITING&order=created_at.desc&limit=15'
            );
            if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
                const now = Date.now();
                for (const room of res.data) {
                    const roomCode = room.room_code;
                    // Ignore test rooms or invalid codes
                    if (!roomCode || roomCode.startsWith('TEST_') || roomCode.startsWith('ROOM_')) {
                        continue;
                    }
                    const createdTime = new Date(room.created_at).getTime();
                    const ageMs = now - createdTime;
                    // Room must be strictly under 30 seconds old (allowing for clock skew)
                    if (ageMs < -10000 || ageMs >= 30000) {
                        continue;
                    }

                    // Query all records for this room to count participants and verify it has not started
                    const roomRecords = await window.supabaseClient.request(
                        '/rest/v1/match_history?room_code=eq.' + encodeURIComponent(roomCode) + '&order=created_at.asc'
                    );
                    if (roomRecords && roomRecords.ok && Array.isArray(roomRecords.data)) {
                        const isStarted = roomRecords.data.some(r => r.mode === 'ONLINE_START' || r.mode === 'ONLINE_ACTIVE');
                        if (isStarted) continue;

                        const humanRows = roomRecords.data.filter(r => r.mode === 'ONLINE_WAITING' || r.mode === 'ONLINE_JOIN');
                        const seenIds = new Set();
                        const validHumans = [];
                        humanRows.forEach(r => {
                            const p = Array.isArray(r.players_data) ? r.players_data[0] : null;
                            if (p && p.id && !p.id.startsWith('p_test') && p.name !== 'Player 1' && !seenIds.has(p.id)) {
                                seenIds.add(p.id);
                                validHumans.push(p);
                            }
                        });

                        if (validHumans.length > 0 && validHumans.length < 4) {
                            console.log('[Matchmaking] Eligible room found: ' + roomCode + ' (' + validHumans.length + '/4 players, age: ' + Math.round(ageMs/1000) + 's)');
                            return {
                                room_code: roomCode,
                                created_at: room.created_at,
                                createdTime: createdTime,
                                currentHumans: validHumans
                            };
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[Matchmaking] Database query error:', e);
        }
        return null;
    }

    /**
     * Unified Global Online Match Entry Point
     */
    async joinUnifiedOnlineMatch(boardId = 'dhaka') {
        console.log('[Matchmaking] Request to join unified online match:', boardId);
        const ui = this.getUI();
        let currentCoins = ui?.userStats?.coins || 0;
        if (currentCoins < 1000) {
            if (ui?.userStats) {
                ui.userStats.coins = 5050;
                localStorage.setItem('lx_coins', '5050');
            }
            this.showToast('🎁 বোনাস: অনলাইন ম্যাচ খেলতে ফ্রি ৫,০০০ কয়েন দেওয়া হলো!');
            window.supabaseClient?.syncProfile(ui.userStats, ui.inventory, true);
        }

        // Clear any old active match session so player enters cleanly
        const activeMatch = this.getActiveMatchSession();
        if (activeMatch) {
            const age = Date.now() - (activeMatch.timestamp || 0);
            if (age > 120000) { // older than 2 minutes
                this.clearActiveMatchSession();
            }
        }

        const targetBoardId = (typeof boardId === 'string' && boardId) ? boardId : 'dhaka';
        const boardDef = (this.boards && this.boards.find(b => b.id === targetBoardId)) || {
            id: 'dhaka',
            name: 'ঢাকা এরিনা (Dhaka Arena)',
            fee: 1000
        };

        // Open Waiting Room Modal immediately with 20s server countdown
        this.openWaitingRoom({
            boardId: boardDef.id,
            boardName: boardDef.name,
            entryFee: boardDef.fee || 1000,
            remainingSeconds: 20,
            players: []
        });

        // Authoritative Cloud Server Mode (Render)
        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('JOIN_BOARD', { boardId: boardDef.id });
            return;
        }

        // Queue action and connect immediately
        this._pendingServerAction = { type: 'JOIN_BOARD', payload: { boardId: boardDef.id } };
        this.connect();
    }

    /**
     * Authoritative Matchmaking Execution (Find or Create Room)
     */
    async executeUnifiedMatchmaking() {
        const ui = this.getUI();
        const myPlayer = {
            id: this.clientId,
            name: ui?.userStats?.name || 'আপনি (You)',
            avatar: ui?.userStats?.avatar || 'king'
        };

        const openRoom = await this.findOpenWaitingRoom();
        if (openRoom) {
            console.log('[Matchmaking] Found open waiting room:', openRoom.room_code);
            await this.joinExistingWaitingRoom(openRoom, myPlayer);
        } else {
            console.log('[Matchmaking] No open waiting room found. Creating new room as Host...');
            await this.createNewWaitingRoom(myPlayer);
        }
    }

    /**
     * Join an existing open waiting room as Green, Yellow, or Blue
     */
    async joinExistingWaitingRoom(openRoom, myPlayer) {
        const colors = ['red', 'green', 'yellow', 'blue'];
        const existingCount = openRoom.currentHumans ? openRoom.currentHumans.length : 1;
        const assignedColor = colors[existingCount] || 'blue';

        const joinedPlayer = {
            id: this.clientId,
            name: myPlayer.name,
            avatar: myPlayer.avatar || 'king',
            color: assignedColor,
            isHost: false,
            isBot: false,
            joinedAt: Date.now()
        };

        this.myColor = assignedColor;
        this.isHost = false;
        this._matchStartFired = false;
        const allPlayers = [...(openRoom.currentHumans || []), joinedPlayer];

        this.currentLobby = {
            roomCode: openRoom.room_code,
            boardName: 'অনলাইন মাল্টিপ্লেয়ার',
            createdAt: openRoom.createdTime || Date.now(),
            players: allPlayers
        };

        // Deduct entry fee idempotently
        this.deductEntryFee(openRoom.room_code);

        // Insert join record into Supabase
        if (window.supabaseClient) {
            try {
                await window.supabaseClient.request('/rest/v1/match_history', {
                    method: 'POST',
                    body: {
                        room_code: openRoom.room_code,
                        mode: 'ONLINE_JOIN',
                        players_data: [joinedPlayer]
                    }
                });
            } catch (e) {
                console.warn('[Matchmaking] Database join INSERT error:', e);
            }
        }

        // Join room channel
        this.joinTopic('realtime:ludo_room_' + openRoom.room_code);
        this.updateWaitingRoomSlots(allPlayers);

        // Broadcast to peers in room
        setTimeout(() => {
            this.broadcast('PLAYER_JOINED_ROOM', {
                player: joinedPlayer,
                players: allPlayers,
                roomCode: openRoom.room_code
            });
        }, 200);

        const remainingMs = Math.max(1000, Math.min(30000, 30000 - Math.max(0, Date.now() - (openRoom.createdTime || Date.now()))));
        this.updateCountdownDisplay(Math.ceil(remainingMs / 1000));

        // If 4 human players reached: Start immediately!
        if (allPlayers.length >= 4) {
            console.log('[Matchmaking] 4 Human players connected! Immediate start.');
            this.lockAndStartMatch(openRoom.room_code, allPlayers);
            return;
        }

        // Start synchronized waiting room sync loop
        this.startWaitingRoomSync(openRoom.room_code, remainingMs, openRoom.createdTime || Date.now());
    }

    /**
     * Create a new waiting room as Host (Seat 1: Red)
     */
    async createNewWaitingRoom(myPlayer) {
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hostPlayer = {
            id: this.clientId,
            name: myPlayer.name,
            avatar: myPlayer.avatar || 'king',
            color: 'red',
            isHost: true,
            isBot: false,
            joinedAt: Date.now()
        };

        this.myColor = 'red';
        this.isHost = true;
        this._matchStartFired = false;
        this.currentLobby = {
            roomCode: roomCode,
            boardName: 'অনলাইন মাল্টিপ্লেয়ার',
            createdAt: Date.now(),
            players: [hostPlayer]
        };

        // Deduct entry fee idempotently
        this.deductEntryFee(roomCode);

        // Insert into Supabase match_history
        if (window.supabaseClient) {
            try {
                await window.supabaseClient.request('/rest/v1/match_history', {
                    method: 'POST',
                    body: {
                        room_code: roomCode,
                        mode: 'ONLINE_WAITING',
                        players_data: [hostPlayer]
                    }
                });
            } catch (e) {
                console.warn('[Matchmaking] Database INSERT error:', e);
            }
        }

        // Join room channel
        this.joinTopic('realtime:ludo_room_' + roomCode);
        this.updateWaitingRoomSlots([hostPlayer]);
        this.updateCountdownDisplay(30);

        // Start synchronized 30-second timer & DB sync
        this._invisibleMatchmakingTimer = true;
        this.startWaitingRoomSync(roomCode, 30000, Date.now());
    }

    /**
     * Synchronized Waiting Room Loop (Authoritative DB polling + 30s countdown)
     */
    startWaitingRoomSync(roomCode, remainingMs = 30000, roomStartTime = Date.now()) {
        if (this._waitingRoomSyncInterval) {
            clearInterval(this._waitingRoomSyncInterval);
            this._waitingRoomSyncInterval = null;
        }
        this._invisibleMatchmakingTimer = true;

        const deadline = roomStartTime + 30000;

        const pollAndCheck = async () => {
            if (this.isOnlineMatch || !this.currentLobby || this.currentLobby.roomCode !== roomCode) {
                if (this._waitingRoomSyncInterval) {
                    clearInterval(this._waitingRoomSyncInterval);
                    this._waitingRoomSyncInterval = null;
                }
                return;
            }

            const now = Date.now();
            const remainingSec = Math.max(0, Math.ceil((deadline - now) / 1000));
            this.updateCountdownDisplay(remainingSec);

            // Authoritative Database Sync for joined players and match start
            if (window.supabaseClient) {
                try {
                    const res = await window.supabaseClient.request(
                        '/rest/v1/match_history?room_code=eq.' + encodeURIComponent(roomCode) + '&order=created_at.asc'
                    );
                    if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
                        // 1. Check if match has already been started
                        const startRow = res.data.find(r => r.mode === 'ONLINE_START' || r.mode === 'ONLINE_ACTIVE');
                        if (startRow && Array.isArray(startRow.players_data) && startRow.players_data.length >= 4) {
                            console.log('[Matchmaking] ONLINE_START record detected in DB! Launching match on device.');
                            if (this._waitingRoomSyncInterval) {
                                clearInterval(this._waitingRoomSyncInterval);
                                this._waitingRoomSyncInterval = null;
                            }
                            const matchPayload = {
                                boardName: 'অনলাইন মাল্টিপ্লেয়ার',
                                roomCode: roomCode,
                                entryFee: 1000,
                                players: startRow.players_data,
                                startingTurn: 'red'
                            };
                            this.joinTopic('realtime:ludo_room_' + roomCode);
                            this.startOnlineMatch(matchPayload);
                            return;
                        }

                        // 2. Assemble current human players in canonical chronological order
                        const colors = ['red', 'green', 'yellow', 'blue'];
                        const humanRows = res.data.filter(r => r.mode === 'ONLINE_WAITING' || r.mode === 'ONLINE_JOIN');
                        const seenIds = new Set();
                        const joinedHumans = [];
                        humanRows.forEach(r => {
                            const p = Array.isArray(r.players_data) ? r.players_data[0] : null;
                            if (p && p.id && !p.id.startsWith('p_test') && p.name !== 'Player 1' && !seenIds.has(p.id)) {
                                seenIds.add(p.id);
                                const seatColor = colors[joinedHumans.length] || 'blue';
                                joinedHumans.push({
                                    ...p,
                                    color: seatColor,
                                    isHost: (joinedHumans.length === 0)
                                });
                            }
                        });

                        if (joinedHumans.length > 0) {
                            this.currentLobby.players = joinedHumans;
                            this.updateWaitingRoomSlots(joinedHumans);

                            // Sync self identity and color
                            const me = joinedHumans.find(p => p.id === this.clientId);
                            if (me) {
                                this.myColor = me.color;
                                this.isHost = !!me.isHost;
                            }

                            // SCENARIO 1: 4 Human Players connected -> Immediate start!
                            if (joinedHumans.length >= 4) {
                                console.log('[Matchmaking] 4 Human players assembled! Starting immediately!');
                                this.lockAndStartMatch(roomCode, joinedHumans);
                                return;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[Matchmaking] Sync poll error:', e);
                }
            }

            // SCENARIO 2: 30-second timer reached 0 -> Start match with joined humans + AI bots
            if (now >= deadline) {
                console.log('[Matchmaking] 30-second countdown finished! Starting match with humans + bots.');
                const humans = this.currentLobby?.players || [{
                    id: this.clientId,
                    name: 'আপনি (You)',
                    color: this.myColor || 'red',
                    isHost: this.isHost
                }];
                this.lockAndStartMatch(roomCode, humans);
            }
        };

        // Run once immediately, then every 1000ms
        pollAndCheck();
        this._waitingRoomSyncInterval = setInterval(pollAndCheck, 1000);
    }

    /**
     * Lock room and start match with humans + bots
     */
    async lockAndStartMatch(roomCode, humanPlayers = []) {
        if (this.isOnlineMatch || this._matchStartFired) return;
        this._matchStartFired = true;

        if (this._waitingRoomSyncInterval) {
            clearInterval(this._waitingRoomSyncInterval);
            this._waitingRoomSyncInterval = null;
        }

        // Authoritative query from database to guarantee all joined humans are included
        if (window.supabaseClient) {
            try {
                const res = await window.supabaseClient.request('/rest/v1/match_history?room_code=eq.' + encodeURIComponent(roomCode) + '&order=created_at.asc');
                if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
                    const humanRows = res.data.filter(r => r.mode === 'ONLINE_WAITING' || r.mode === 'ONLINE_JOIN');
                    const seenIds = new Set();
                    const freshHumans = [];
                    humanRows.forEach(r => {
                        const p = Array.isArray(r.players_data) ? r.players_data[0] : null;
                        if (p && p.id && !p.id.startsWith('p_test') && p.name !== 'Player 1' && !seenIds.has(p.id)) {
                            seenIds.add(p.id);
                            freshHumans.push(p);
                        }
                    });
                    if (freshHumans.length > 0) {
                        humanPlayers = freshHumans;
                    }
                }
            } catch (e) {}
        }

        console.log('[Matchmaking] lockAndStartMatch invoked for room ' + roomCode + '. Human count: ' + humanPlayers.length);

        const colors = ['red', 'green', 'yellow', 'blue'];
        const botNames = ['সাকিব_কিং 🇧🇩 🤖', 'তামিম_প্রো 🇧🇩 🤖', 'রাহুল_লুডু 🇧🇩 🤖'];

        // Assign colors cleanly to humans
        const finalPlayers = [];
        humanPlayers.forEach((p, idx) => {
            finalPlayers.push({
                id: p.id,
                name: p.name,
                avatar: p.avatar || 'king',
                color: colors[idx] || p.color,
                isBot: false,
                isHost: (idx === 0)
            });
        });

        // Backfill remaining slots with AI bots until exactly 4 players
        while (finalPlayers.length < 4) {
            const takenColors = finalPlayers.map(p => p.color);
            const nextColor = colors.find(c => !takenColors.includes(c)) || 'blue';
            const botIdx = finalPlayers.length - 1;
            finalPlayers.push({
                id: 'bot_' + nextColor,
                name: botNames[botIdx] || ('লুডু বট (' + nextColor.toUpperCase() + ') 🤖'),
                color: nextColor,
                isBot: true,
                isHost: false,
                avatar: 'robot'
            });
        }

        const matchPayload = {
            boardName: 'অনলাইন মাল্টিপ্লেয়ার',
            roomCode: roomCode,
            entryFee: 1000,
            players: finalPlayers,
            startingTurn: 'red'
        };

        // Post authoritative ONLINE_START record to Supabase
        if (window.supabaseClient) {
            try {
                await window.supabaseClient.request('/rest/v1/match_history', {
                    method: 'POST',
                    body: {
                        room_code: roomCode,
                        mode: 'ONLINE_START',
                        players_data: finalPlayers
                    }
                });
                await window.supabaseClient.request('/rest/v1/match_history?room_code=eq.' + encodeURIComponent(roomCode), {
                    method: 'PATCH',
                    body: {
                        mode: 'ONLINE_ACTIVE',
                        players_data: finalPlayers
                    }
                });
            } catch (e) {
                console.warn('[Matchmaking] Failed to post ONLINE_START record:', e);
            }
        }

        // Broadcast start to all peers in room
        this.broadcast('FORCE_START_NOW', { matchPayload, roomCode: roomCode });
        this.broadcast('MATCH_STARTED', matchPayload);

        // Maintain continuous room topic & start online match
        const matchTopic = 'realtime:ludo_room_' + roomCode;
        this.joinTopic(matchTopic);
        this.startOnlineMatch(matchPayload);
    }

    // Backward-compatibility aliases
    async lockAndStart4Humans(humanPlayers) {
        const roomCode = this.currentLobby?.roomCode;
        if (roomCode) await this.lockAndStartMatch(roomCode, humanPlayers);
    }

    async lockAndStartWithBots() {
        const roomCode = this.currentLobby?.roomCode;
        if (roomCode) await this.lockAndStartMatch(roomCode, this.currentLobby?.players || []);
    }

    startInvisibleMatchTimer(roomCode, durationMs = 30000) {
        this.startWaitingRoomSync(roomCode, durationMs, Date.now());
    }


    createPrivateRoom(playerCount = 4) {
        const count = playerCount || 4;
        this.openWaitingRoom({
            boardId: 'private',
            boardName: 'বন্ধুদের সাথে প্রাইভেট রুম',
            entryFee: 0,
            remainingSeconds: 15,
            players: []
        });

        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('CREATE_PRIVATE_ROOM', { playerCount: count });
            return;
        }

        this._pendingServerAction = { type: 'CREATE_PRIVATE_ROOM', payload: { playerCount: count } };
        this.connect();
    }

    joinPrivateRoom(roomCode) {
        const code = (roomCode || '').trim();
        if (!code || code.length < 4) {
            alert('সঠিক রুম কোড লিখুন!');
            return;
        }

        this.openWaitingRoom({
            boardId: `room_${code}`,
            roomCode: code,
            isPrivate: true,
            boardName: `প্রাইভেট রুম #${code}`,
            entryFee: 0,
            remainingSeconds: 15,
            players: []
        });

        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('JOIN_PRIVATE_ROOM', { roomCode: code });
            return;
        }

        this._pendingServerAction = { type: 'JOIN_PRIVATE_ROOM', payload: { roomCode: code } };
        this.connect();
    }

    // Backward-compatibility aliases for legacy calls
    joinBoard(boardId, entryFee = 500) {
        this.joinUnifiedOnlineMatch(boardId || 'dhaka');
    }

    requestQuickMatch(playerCount = 4) {
        this.joinUnifiedOnlineMatch('dhaka');
    }

    startInternalMatchmaking(board) {
        this.startInvisibleMatchTimer(this.currentRoomCode, 30000);
    }

    startLobbyCountdown(seconds, board) {
        this.startInvisibleMatchTimer(this.currentRoomCode, 30000);
    }

    leaveLobby(showLobbyModal = true) {
        if (this._waitingRoomSyncInterval) {
            clearInterval(this._waitingRoomSyncInterval);
            this._waitingRoomSyncInterval = null;
        }
        this._matchStartFired = false;
        if (this._invisibleMatchmakingTimer) {
            clearTimeout(this._invisibleMatchmakingTimer);
            this._invisibleMatchmakingTimer = null;
        }
        if (this._matchmakingRaceCheckTimer) {
            clearTimeout(this._matchmakingRaceCheckTimer);
            this._matchmakingRaceCheckTimer = null;
        }
        if (this._internalMatchmakingTimer) {
            clearTimeout(this._internalMatchmakingTimer);
            this._internalMatchmakingTimer = null;
        }
        if (this._lobbyDiscoveryTimer) {
            clearTimeout(this._lobbyDiscoveryTimer);
            this._lobbyDiscoveryTimer = null;
        }
        if (this.localTimer) {
            clearInterval(this.localTimer);
            this.localTimer = null;
        }
        if (this.currentTopic) {
            this.broadcast('PLAYER_LEFT_LOBBY', { playerId: this.clientId, color: this.myColor });
        }
        // If host leaves waiting room, delete waiting room record from Supabase so others aren't stranded
        if (this.isHost && this.currentLobby?.id && window.supabaseClient) {
            window.supabaseClient.request('/rest/v1/match_history?id=eq.' + this.currentLobby.id, { method: 'DELETE' });
        }
        this.leaveCurrentTopic();
        const modalWaiting = document.getElementById('modalOnlineWaitingRoom');
        if (modalWaiting) modalWaiting.classList.remove('active');
        const modalLobby = document.getElementById('modalOnlineLobby');
        if (modalLobby) {
            if (showLobbyModal) {
                modalLobby.classList.add('active');
            } else {
                modalLobby.classList.remove('active');
            }
        }
        this.currentLobby = null;
        this.isHost = false;
        this.myColor = null;
    }

    leaveCurrentMatch(isPermanentAbandon = false) {
        this.clearTurnTimers();
        this.stopHeartbeat();
        this.stopMatchWatchdog();
        if (this.botRollTimeout) {
            clearTimeout(this.botRollTimeout);
            this.botRollTimeout = null;
        }

        if (isPermanentAbandon) {
            if (this.isOnlineMatch && this.myColor) {
                this.broadcast('PLAYER_LEFT_MATCH', { color: this.myColor, playerId: this.clientId });
            }
            this.leaveCurrentTopic();
            this.clearActiveMatchSession();
            this.isOnlineMatch = false;
            this.currentRoom = null;
            this.currentTurnColor = null;
            this.isHost = false;
            this.myColor = null;
            this.botColors = [];
        } else {
            // Soft temporary leave to home screen:
            // Match session is preserved so user can rejoin anytime from the Online screen!
            if (this.isOnlineMatch) {
                this.saveActiveMatchBoardState();
                this.broadcast('PLAYER_LEFT_MATCH', { color: this.myColor, playerId: this.clientId });
                this.showToast('💡 চলমান ম্যাচ ব্যাকগ্রাউন্ডে চলছে। অনলাইন মোড থেকে পুনরায় যোগ দিতে পারবেন।');
            }
            this.isOnlineMatch = false;
        }

        this.currentTurnSeq = 0;
        this.currentTurnStage = null;
        this.stageActionExecuted = false;

        // Hide live online HUD
        const hud = document.getElementById('onlineMatchLiveHud');
        if (hud) hud.style.display = 'none';
        if (typeof document !== 'undefined') {
            document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'none');
            document.body?.classList?.remove('online-match-active');
        }

        // Close any online lobby and waiting room modals
        const modalWaiting = document.getElementById('modalOnlineWaitingRoom');
        if (modalWaiting) modalWaiting.classList.remove('active');
        const modalLobby = document.getElementById('modalOnlineLobby');
        if (modalLobby) modalLobby.classList.remove('active');

        // Safe return to home screen (avoid blank screen)
        const homeScreen = document.getElementById('homeScreen');
        if (homeScreen) {
            homeScreen.style.display = 'flex';
            homeScreen.classList.add('active');
        }
        document.querySelectorAll('.in-game-only').forEach(el => el.style.display = 'none');

        // Reset board orientation and corner pods to default Red canonical
        const ui = this.getUI();
        if (ui && typeof ui.updatePodPositions === 'function') {
            ui.updatePodPositions();
        }
        if (ui && typeof ui.render === 'function') {
            ui.render();
        }

        this.updateActiveMatchUI();
    }

    saveActiveMatchSession(matchData) {
        if (!matchData) return;
        const session = {
            roomCode: matchData.roomCode || this.currentRoomCode,
            boardId: matchData.boardId || 'unified_online',
            boardName: matchData.boardName || 'অনলাইন মাল্টিপ্লেয়ার',
            entryFee: 1000,
            winPrize: 10000,
            secondPrize: 5000,
            myColor: this.myColor || 'red',
            clientId: this.clientId,
            matchPlayers: this.matchPlayers || [],
            isHost: false,
            startedAt: Date.now(),
            topic: `realtime:ludo_room_${matchData.roomCode || this.currentRoomCode}`
        };
        try {
            localStorage.setItem('lx_active_online_match', JSON.stringify(session));
        } catch (e) {
            console.warn('[Supabase Realtime] Failed to cache active match:', e);
        }
        this.updateActiveMatchUI();
    }

    getActiveMatchSession() {
        try {
            const raw = localStorage.getItem('lx_active_online_match');
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session || !session.roomCode) return null;

            // Expire after 35 minutes (longest match duration)
            if (Date.now() - session.startedAt > 35 * 60 * 1000) {
                this.clearActiveMatchSession();
                return null;
            }
            return session;
        } catch (e) {
            return null;
        }
    }

    clearActiveMatchSession() {
        try {
            localStorage.removeItem('lx_active_online_match');
            localStorage.removeItem('lx_active_online_match_state');
        } catch (e) {}
        this.updateActiveMatchUI();
    }

    saveActiveMatchBoardState() {
        const ui = this.getUI();
        if (!ui || !ui.engine || !ui.engine.players) return;
        const statePayload = {
            tokens: ui.engine.players.map(p => ({
                id: p.id,
                finishedTokens: p.finishedTokens,
                rank: p.rank,
                tokens: p.tokens.map(t => ({
                    id: t.id,
                    state: t.state,
                    stepCount: (t.stepCount !== undefined ? t.stepCount : (t.step || 0)),
                    step: (t.stepCount !== undefined ? t.stepCount : (t.step || 0)),
                    trackIndex: t.trackIndex,
                    homePathIndex: t.homePathIndex,
                    hasShield: !!t.hasShield
                }))
            })),
            currentTurnColor: this.currentTurnColor,
            currentTurnSeq: this.currentTurnSeq,
            currentTurnStage: this.currentTurnStage,
            stageDeadline: this.stageDeadlineMs || null,
            lastDiceValue: this.lastDiceValue || null,
            updatedAt: Date.now()
        };
        try {
            localStorage.setItem('lx_active_online_match_state', JSON.stringify(statePayload));
        } catch (e) {}
    }

    updateActiveMatchUI() {
        const session = this.getActiveMatchSession();
        const ongoingContainer = document.getElementById('ongoingMatchContainer');
        const homeAlert = document.getElementById('homeActiveMatchAlert');
        const homeAlertBoard = document.getElementById('homeAlertBoardName');

        if (session) {
            if (ongoingContainer) {
                ongoingContainer.style.display = 'block';
                const boardNameEl = document.getElementById('ongoingMatchBoardName');
                const roomCodeEl = document.getElementById('ongoingMatchRoomCode');
                const myColorEl = document.getElementById('ongoingMatchMyColor');
                const colorNames = {
                    red: 'লাল (Red)',
                    green: 'সবুজ (Green)',
                    yellow: 'হলুদ (Yellow)',
                    blue: 'নীল (Blue)'
                };
                const colorHexes = {
                    red: '#ef4444',
                    green: '#22c55e',
                    yellow: '#eab308',
                    blue: '#3b82f6'
                };
                if (boardNameEl) boardNameEl.textContent = session.boardName || 'অনলাইন মাল্টিপ্লেয়ার';
                if (roomCodeEl) roomCodeEl.textContent = `রুম কোড: ${session.roomCode}`;
                if (myColorEl) {
                    const c = session.myColor || 'red';
                    myColorEl.innerHTML = `আপনার রঙ: <b style="color: ${colorHexes[c] || '#ef4444'};">${colorNames[c] || c}</b>`;
                }
            }

            if (homeAlert) {
                homeAlert.style.display = 'flex';
                if (homeAlertBoard) {
                    homeAlertBoard.textContent = `${session.boardName || 'অনলাইন ম্যাচ'} • রুম: ${session.roomCode}`;
                }
            }
        } else {
            if (ongoingContainer) ongoingContainer.style.display = 'none';
            if (homeAlert) homeAlert.style.display = 'none';
        }

        const lobbyCoinEl = document.getElementById('onlineLobbyCoinBalance');
        if (lobbyCoinEl) {
            const ui = this.getUI();
            lobbyCoinEl.textContent = (ui?.userStats?.coins || 0).toLocaleString();
        }

        // Highlight matching card in boards list
        const boardsList = document.getElementById('onlineBoardsList');
        if (boardsList && typeof boardsList.querySelectorAll === 'function') {
            const cards = boardsList.querySelectorAll('.online-board-card');
            if (cards && cards.length > 0) {
                cards.forEach(card => {
                    const bId = card.getAttribute('data-board');
                    const isThisActive = session && (session.boardId === bId);
                    card.classList.toggle('active-match-card-glow', !!isThisActive);
                    const tagEl = card.querySelector ? card.querySelector('.board-live-tag') : null;
                    const btnEl = card.querySelector ? card.querySelector('button') : null;
                    if (tagEl) {
                        if (isThisActive) {
                            tagEl.innerHTML = '🟢 <strong>আপনার ম্যাচ চলছে (ক্লিক করে পুনরায় যোগ দিন)</strong>';
                            tagEl.style.color = '#22c55e';
                        } else {
                            tagEl.innerHTML = '⚡ সুপাবেজ ক্লাউড এরিনা (১৫ সেকেন্ড টাইমার)';
                            tagEl.style.color = '';
                        }
                    }
                    if (btnEl) {
                        btnEl.textContent = isThisActive ? 'পুনরায় প্রবেশ 🚀' : 'প্রবেশ';
                    }
                });
            }
        }
    }

    rejoinActiveMatch() {
        const session = this.getActiveMatchSession();
        if (!session) {
            this.showToast('⚠️ কোনো সক্রিয় চলমান ম্যাচ পাওয়া যায়নি।');
            return;
        }

        console.log('[Match Rejoin] Rejoining active match:', session.roomCode);
        window.soundFX?.playClick();

        // 1. Ensure WebSocket connection
        this.connect();

        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('REJOIN_ROOM', { roomCode: session.roomCode, color: session.myColor || this.myColor });
            return;
        }

        // 2. Restore session parameters
        this.isOnlineMatch = true;
        this.currentRoom = session;
        this.myColor = session.myColor || 'red';
        this.clientId = session.clientId || this.clientId;
        this.isHost = !!session.isHost;
        this.matchPlayers = session.matchPlayers || [];
        this.botColors = this.matchPlayers.filter(p => p.isBot).map(p => p.color);

        // 3. Switch UI to in-game board
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.classList.remove('active');
            m.style.display = 'none';
        });
        const homeScreen = document.getElementById('homeScreen');
        if (homeScreen) {
            homeScreen.classList.remove('active');
            homeScreen.style.display = 'none';
        }
        document.querySelectorAll('.in-game-only').forEach(el => el.style.display = 'flex');
        const hud = document.getElementById('onlineMatchLiveHud');
        if (hud) hud.style.display = 'flex';
        if (typeof document !== 'undefined') {
            document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'inline-flex');
            document.body?.classList?.add('online-match-active');
        }

        // 4. Initialize UI engine with players
        const ui = this.getUI();
        const customNames = {};
        const playerTypes = {};
        this.matchPlayers.forEach(p => {
            if (p.isBot) {
                customNames[p.color] = p.name;
                playerTypes[p.color] = 'ai';
            } else if (p.id === this.clientId) {
                customNames[p.color] = `${p.name} (You) 🇧🇩`;
                playerTypes[p.color] = 'human';
            } else {
                customNames[p.color] = `${p.name} 🌐`;
                playerTypes[p.color] = 'human';
            }
        });

        const activeColors = ['red', 'green', 'yellow', 'blue'];
        const boardTitle = session.boardName || 'ঢাকা এরিনা';
        const modeTitle = `⚡ ${boardTitle} (চলমান ম্যাচ)`;

        try {
            if (typeof ui.launchGameWithMode === 'function') {
                ui.launchGameWithMode('CLASSIC', 'online', modeTitle, 4, customNames, false, activeColors, playerTypes);
            }
        } catch (e) {
            console.error('[Supabase Realtime] Game relaunch error:', e);
        }

        // 5. Restore local board snapshot immediately (no blank board)
        try {
            const rawLocalState = localStorage.getItem('lx_active_online_match_state');
            if (rawLocalState) {
                const localState = JSON.parse(rawLocalState);
                if (localState && localState.tokens && ui?.engine?.players) {
                    this.applySynchronizedState(localState);
                }
            }
        } catch (e) {}

        if (typeof ui.initCanvasSize === 'function') ui.initCanvasSize();
        if (typeof ui.render === 'function') ui.render();

        // 6. Join/maintain the room topic
        const matchTopic = `realtime:ludo_room_${session.roomCode}`;
        this.joinTopic(matchTopic);
        this.peerLastSeen = {};
        this.startHeartbeat();
        this.startMatchWatchdog();

        // 7. Broadcast rejoin and request fresh authoritative sync from peers
        setTimeout(() => {
            this.broadcast('REQUEST_MATCH_STATE', {
                rejoiningPlayerId: this.clientId,
                rejoiningColor: this.myColor,
                rejoiningName: ui?.userStats?.name || 'Player'
            });
            this.broadcast('PLAYER_REJOINED_MATCH', {
                color: this.myColor,
                playerId: this.clientId,
                playerName: ui?.userStats?.name || 'Player'
            });
        }, 300);

        // 8. Auto-Resume Bot Turn on Rejoin:
        // Only trigger if rejoining alone where all other 3 players are bots:
        setTimeout(() => {
            if (this.isOnlineMatch) {
                const ui = this.getUI();
                const curTurn = this.currentTurnColor;
                const isCurBot = (this.botColors && this.botColors.includes(curTurn));
                const allOthersBots = ['red', 'green', 'yellow', 'blue'].filter(c => c !== this.myColor).every(c => this.botColors.includes(c));
                if (allOthersBots && isCurBot && ui && ui.engine) {
                    if (ui.engine.state === 'WAITING_ROLL') {
                        console.log(`[Rejoin Auto-Resume] Alone with bots. Bot ${curTurn} waiting to roll...`);
                        this.executeDeterministicBotTurn(curTurn);
                    } else if (ui.engine.state === 'SELECTING_TOKEN' && ui.engine.diceValue > 0) {
                        this.executeAutoMove(curTurn, this.currentTurnSeq);
                    }
                }
            }
        }, 1100);

        this.showToast(`🎉 আপনি সফলভাবে ${session.boardName || 'ম্যাচে'} পুনরায় যুক্ত হয়েছেন!`);
        this.updateActiveMatchUI();
    }

    abandonActiveMatch() {
        const session = this.getActiveMatchSession();
        if (!session) return;
        if (!confirm('আপনি কি নিশ্চিতভাবে এই অনলাইন ম্যাচটি পরিত্যাগ করতে চান?\nআপনার এন্ট্রি ফি বাজেয়াপ্ত হবে।')) {
            return;
        }

        window.soundFX?.playClick();
        if (session.topic) {
            this.broadcast('PLAYER_LEFT_MATCH', { color: session.myColor, playerId: this.clientId });
            this.leaveCurrentTopic();
        }

        this.clearActiveMatchSession();
        this.isOnlineMatch = false;
        this.currentRoom = null;
        this.showToast('🚪 আপনি ম্যাচটি পরিত্যাগ করেছেন।');
    }

    applySynchronizedState(stateData) {
        if (!stateData) return;
        const ui = this.getUI();
        if (!ui || !ui.engine || !ui.engine.players) return;

        // Sequence guard: ignore older stale state syncs
        if (stateData.currentTurnSeq !== undefined) {
            if (this._lastAppliedSyncSeq && stateData.currentTurnSeq < this._lastAppliedSyncSeq) {
                console.log(`[State Sync] Ignored older state sync seq ${stateData.currentTurnSeq} (latest is ${this._lastAppliedSyncSeq})`);
                return;
            }
            this._lastAppliedSyncSeq = stateData.currentTurnSeq;
        }

        // Restore bot colors & local auto-play indicator
        if (Array.isArray(stateData.botColors)) {
            const isLocalBot = stateData.botColors.includes(this.myColor);
            this.botColors = [...stateData.botColors];
            ui.engine.players.forEach(p => {
                p.isAI = this.botColors.includes(p.id);
            });
            this.updateAutoPlayUI(isLocalBot);
        }

        // Restore token coordinates & status
        const tokenList = stateData.tokens || stateData.playersTokens;
        if (Array.isArray(tokenList)) {
            tokenList.forEach(savedP => {
                const liveP = ui.engine.players.find(p => p.id === savedP.id);
                if (liveP && Array.isArray(savedP.tokens)) {
                    if (savedP.finishedTokens !== undefined) liveP.finishedTokens = savedP.finishedTokens;
                    if (savedP.rank !== undefined) liveP.rank = savedP.rank;
                    savedP.tokens.forEach(savedT => {
                        const liveT = liveP.tokens.find(t => t.id === savedT.id);
                        if (liveT) {
                            liveT.state = savedT.state;
                            const restoredStep = (savedT.stepCount !== undefined ? savedT.stepCount : (savedT.step || 0));
                            liveT.stepCount = restoredStep;
                            liveT.step = restoredStep;
                            liveT.trackIndex = savedT.trackIndex;
                            liveT.homePathIndex = savedT.homePathIndex;
                            liveT.hasShield = !!savedT.hasShield;
                        }
                    });
                }
            });
        }

        // Restore active turn color & turn index
        if (stateData.currentTurnColor) {
            this.currentTurnColor = stateData.currentTurnColor;
            const turnIdx = ui.engine.players.findIndex(p => p.id === stateData.currentTurnColor);
            if (turnIdx !== -1) {
                ui.engine.currentTurnIndex = turnIdx;
            }
        }
        if (stateData.currentTurnSeq !== undefined) {
            this.currentTurnSeq = stateData.currentTurnSeq;
        }

        const isMyTurn = (this.currentTurnColor === this.myColor);

        // Restore stage & dice state
        if (stateData.currentTurnStage === 'MOVE') {
            const dice = stateData.lastDiceValue || stateData.dice || 0;
            this.lastDiceValue = dice;
            ui.engine.diceValue = dice;
            ui.engine.state = 'SELECTING_TOKEN';
            if (typeof ui.engine.getValidMoves === 'function') {
                ui.engine.getValidMoves();
            }
            if (stateData.stageDeadline) {
                this.startStageBTokenMove(this.currentTurnColor, this.currentTurnSeq, stateData.stageDeadline);
            }
        } else {
            ui.engine.state = 'WAITING_ROLL';
            ui.engine.diceValue = 0;
            ui.engine.validMoves = [];
            if (stateData.stageDeadline) {
                this.startStageADiceRoll(this.currentTurnColor, this.currentTurnSeq, stateData.stageDeadline);
            } else if (this.currentTurnColor) {
                this.handleTurnChanged(this.currentTurnColor);
            }
        }

        // Lock/Unlock dice box according to turn
        ['red', 'green', 'yellow', 'blue'].forEach(c => {
            const box = document.getElementById(`dice_box_${c}`);
            if (box) {
                if (c === this.currentTurnColor && isMyTurn && ui.engine.state === 'WAITING_ROLL') {
                    box.style.pointerEvents = 'auto';
                    box.style.cursor = 'pointer';
                } else {
                    box.style.pointerEvents = 'none';
                    box.style.cursor = 'default';
                }
            }
        });

        if (typeof ui.updatePlayerPods === 'function') ui.updatePlayerPods();
        if (typeof ui.render === 'function') ui.render();
    }

    bindRejoinUI() {
        const btnRejoin = document.getElementById('btnRejoinActiveMatch');
        if (btnRejoin) {
            btnRejoin.addEventListener('click', (e) => {
                e.stopPropagation();
                this.rejoinActiveMatch();
            });
        }

        const btnAbandon = document.getElementById('btnAbandonActiveMatch');
        if (btnAbandon) {
            btnAbandon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.abandonActiveMatch();
            });
        }

        const btnHomeRejoin = document.getElementById('btnHomeRejoinMatch');
        if (btnHomeRejoin) {
            btnHomeRejoin.addEventListener('click', (e) => {
                e.stopPropagation();
                this.rejoinActiveMatch();
            });
        }
    }

    forceStartMatch() {
        const roomCode = this.currentLobby?.roomCode;
        if (!roomCode || this.isOnlineMatch || this._matchStartFired) return;
        console.log('[Matchmaking] Force start triggered for room:', roomCode);
        this.lockAndStartMatch(roomCode, this.currentLobby?.players || []);
    }

    // -------------------------------------------------------------
    // Waiting Room & Lobby UI Binding
    // -------------------------------------------------------------
    bindWaitingRoomUI() {
        const btnLeave = document.getElementById('btnLeaveOnlineLobby');
        if (btnLeave) {
            btnLeave.addEventListener('click', () => {
                window.soundFX?.playClick();
                this.leaveLobby();
            });
        }

        const btnClose = document.getElementById('btnCloseWaitingRoom');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                window.soundFX?.playClick();
                this.leaveLobby();
            });
        }

        const btnForceStart = document.getElementById('btnForceStartOnlineMatch');
        if (btnForceStart) {
            btnForceStart.addEventListener('click', () => {
                window.soundFX?.playClick();
                this.forceStartMatch();
            });
        }

        // 1-Tap Room Code Copy
        const btnCopy = document.getElementById('btnCopyRoomCode');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                const code = this.currentLobby?.roomCode || this.currentRoom?.roomCode;
                if (!code) return;
                window.soundFX?.playClick();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(code).then(() => {
                        const orig = btnCopy.textContent;
                        btnCopy.textContent = '✅ কোড কপি হয়েছে!';
                        this.showToast(`📋 রুম কোড কপি হয়েছে: ${code}`);
                        setTimeout(() => { btnCopy.textContent = orig; }, 2000);
                    }).catch(() => this.fallbackCopyText(code, btnCopy));
                } else {
                    this.fallbackCopyText(code, btnCopy);
                }
            });
        }

        // Online Lobby Mode Tabs: Arenas vs Private Room
        const tabArenas = document.getElementById('tabOnlineArenas');
        const tabPrivate = document.getElementById('tabOnlinePrivate');
        const panelArenas = document.getElementById('panelOnlineArenas');
        const panelPrivate = document.getElementById('panelOnlinePrivate');

        if (tabArenas && tabPrivate && panelArenas && panelPrivate) {
            tabArenas.addEventListener('click', () => {
                window.soundFX?.playClick();
                tabArenas.classList.add('active');
                tabPrivate.classList.remove('active');
                panelArenas.style.display = 'block';
                panelPrivate.style.display = 'none';
            });

            tabPrivate.addEventListener('click', () => {
                window.soundFX?.playClick();
                tabPrivate.classList.add('active');
                tabArenas.classList.remove('active');
                panelPrivate.style.display = 'block';
                panelArenas.style.display = 'none';
            });
        }

        // Direct Private Room Create / Join
        const btnCreateDirect = document.getElementById('btnCreatePrivateRoomDirect');
        if (btnCreateDirect) {
            btnCreateDirect.addEventListener('click', () => {
                window.soundFX?.playClick();
                this.createPrivateRoom();
            });
        }

        const btnJoinDirect = document.getElementById('btnJoinPrivateRoomDirect');
        const inputCode = document.getElementById('inputPrivateRoomCode');
        if (btnJoinDirect && inputCode) {
            btnJoinDirect.addEventListener('click', () => {
                const code = inputCode.value.trim();
                window.soundFX?.playClick();
                this.joinPrivateRoom(code);
            });
        }

        // Live HUD Online Exit Button
        const btnExitHud = document.getElementById('btnOnlineExitGame');
        if (btnExitHud) {
            btnExitHud.addEventListener('click', () => {
                window.soundFX?.playClick();
                const modalConfirm = document.getElementById('modalConfirmExit');
                if (modalConfirm) {
                    const desc = modalConfirm.querySelector('p');
                    if (desc) {
                        desc.textContent = 'আপনি কি সত্যিই ম্যাচটি ত্যাগ করতে চান? ম্যাচ ত্যাগ করলে আপনি আর এই রুমে পুনরায় ঢুকতে পারবেন না এবং আপনার জায়গায় রোবট খেলবে।';
                    }
                    modalConfirm.classList.add('active');
                } else {
                    this.leaveCurrentMatch(true);
                }
            });
        }

        // Auto Play Off / Resume Button in Floating Pill
        const btnAutoPlayOff = document.getElementById('btnAutoPlayOff');
        if (btnAutoPlayOff) {
            btnAutoPlayOff.addEventListener('click', () => {
                window.soundFX?.playClick();
                this.toggleAutoPlay();
            });
        }
    }

    fallbackCopyText(text, btnElement) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (btnElement) {
                const orig = btnElement.textContent;
                btnElement.textContent = '✅ কোড কপি হয়েছে!';
                setTimeout(() => { btnElement.textContent = orig; }, 2000);
            }
            this.showToast(`📋 রুম কোড কপি হয়েছে: ${text}`);
        } catch (e) {
            this.showToast(`কোড: ${text}`);
        }
    }

    openWaitingRoom(data) {
        this.currentLobby = data;
        const modalLobby = document.getElementById('modalOnlineLobby');
        if (modalLobby) modalLobby.classList.remove('active');

        const modalSocial = document.getElementById('modalSocialTab');
        if (modalSocial) modalSocial.classList.remove('active');

        const modalWaiting = document.getElementById('modalOnlineWaitingRoom');
        if (modalWaiting) modalWaiting.classList.add('active');

        const title = document.getElementById('waitingRoomBoardTitle');
        if (title) title.textContent = `🌐 ${data.boardName || 'অনলাইন ওয়েটিং রুম'}`;

        // Toggle Private Room Code Box
        const codeBox = document.getElementById('waitingRoomCodeBox');
        const codeVal = document.getElementById('waitingRoomCodeVal');
        if (data.roomCode && data.isPrivate) {
            if (codeBox) codeBox.style.display = 'flex';
            if (codeVal) codeVal.textContent = data.roomCode;
        } else {
            if (codeBox) codeBox.style.display = 'none';
        }

        if (data.isPrivate || data.boardId === 'private' || data.roomCode) {
            this.updateCountdownDisplay(null);
        } else {
            this.updateCountdownDisplay(data.remainingSeconds !== undefined ? data.remainingSeconds : 20);
        }
        this.updateWaitingRoomSlots(data.players || []);
    }

    updateCountdownDisplay(seconds) {
        const countdownEl = document.getElementById('onlineLobbyCountdown');
        const noticeEl = document.getElementById('waitingRoomNoticeText');
        if (seconds === null || seconds === undefined) {
            if (countdownEl) countdownEl.style.display = 'none';
            if (noticeEl) noticeEl.textContent = 'বন্ধুদের যুক্ত হওয়ার জন্য অপেক্ষা করা হচ্ছে... (হোস্ট শুরু করতে পারেন)';
            return;
        }
        if (countdownEl) {
            countdownEl.style.display = 'block';
            const s = Math.max(0, Math.floor(seconds));
            countdownEl.textContent = `00:${s < 10 ? '0' : ''}${s}`;
        }
        if (noticeEl) {
            noticeEl.textContent = seconds > 0
                ? '⏱️ ২০ সেকেন্ডে খেলা শুরু হবে (বাকি স্লটে বট যুক্ত হবে)'
                : '🚀 ম্যাচ শুরু হচ্ছে...';
        }
    }

    updateWaitingRoomSlots(players) {
        const slots = ['Red', 'Green', 'Yellow', 'Blue'];
        const colors = ['red', 'green', 'yellow', 'blue'];

        slots.forEach((colorName, idx) => {
            const slotEl = document.getElementById(`slot${colorName}`);
            const nameEl = document.getElementById(`slot${colorName}Name`);
            const lobbyPreviewEl = document.getElementById(`lobbySeat${colorName}Name`);

            const player = (players || []).find(p => p.color === colors[idx]);
            if (player) {
                if (slotEl) {
                    slotEl.classList.remove('empty');
                    slotEl.classList.add('active');
                }
                const displayName = (player.id === this.clientId) 
                    ? `${player.name} (You)` 
                    : `${player.name}`;
                if (nameEl) nameEl.textContent = displayName;
                if (lobbyPreviewEl) lobbyPreviewEl.textContent = displayName;
            } else {
                if (slotEl) {
                    slotEl.classList.remove('active');
                    slotEl.classList.add('empty');
                }
                if (nameEl) nameEl.textContent = 'অপেক্ষা করা হচ্ছে...';
                if (lobbyPreviewEl) lobbyPreviewEl.textContent = 'অনলাইন প্লেয়ার';
            }
        });

        const btnForceStart = document.getElementById('btnForceStartOnlineMatch');
        if (btnForceStart) {
            btnForceStart.style.display = this.isHost ? 'block' : 'none';
        }
    }

    // -------------------------------------------------------------
    // Live Synchronized Online Match Execution
    // -------------------------------------------------------------
    startOnlineMatch(matchData) {
        const ui = this.getUI();
        if (!ui) return;

        if (this._invisibleMatchmakingTimer) {
            clearTimeout(this._invisibleMatchmakingTimer);
            this._invisibleMatchmakingTimer = null;
        }
        if (this._matchmakingRaceCheckTimer) {
            clearTimeout(this._matchmakingRaceCheckTimer);
            this._matchmakingRaceCheckTimer = null;
        }
        if (this._internalMatchmakingTimer) {
            clearTimeout(this._internalMatchmakingTimer);
            this._internalMatchmakingTimer = null;
        }
        if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
        this.isOnlineMatch = true;
        this.currentRoom = matchData;

        // Deduct entry fee idempotently and sync with Supabase
        if (matchData.roomCode) {
            this.deductEntryFee(matchData.roomCode, matchData.entryFee || 500);
            if (window.supabaseClient) {
                window.supabaseClient.request('/rest/v1/match_history', {
                    method: 'POST',
                    body: {
                        room_code: matchData.roomCode,
                        mode: 'ONLINE_MULTIPLAYER',
                        players_data: matchData.players || [],
                        created_at: new Date().toISOString()
                    }
                }).catch(() => {});
            }
        }

        // Close all modals
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.classList.remove('active');
            m.style.display = 'none';
        });

        // Hide home screen, show stage
        const homeScreen = document.getElementById('homeScreen');
        if (homeScreen) {
            homeScreen.classList.remove('active');
            homeScreen.style.display = 'none';
        }
        document.querySelectorAll('.in-game-only').forEach(el => el.style.display = 'flex');

        this.matchPlayers = matchData.players || [];
        this.botColors = this.matchPlayers.filter(p => p.isBot).map(p => p.color);
        this.peerLastSeen = {};
        this._matchStartTime = Date.now();
        this.matchPlayers.forEach(p => {
            this.peerLastSeen[p.color] = Date.now();
        });

        // Authoritative Player Color Assignment: Direct from Server session
        if (matchData.yourColor) {
            this.myColor = matchData.yourColor;
        } else if (this.currentLobby && this.currentLobby.myColor) {
            this.myColor = this.currentLobby.myColor;
        } else {
            const me = this.matchPlayers.find(p => p.id === this.clientId);
            if (me) {
                this.myColor = me.color;
            } else if (!this.myColor) {
                this.myColor = 'red';
            }
        }
        console.log(`[Player Identity] Authoritatively resolved myColor: ${this.myColor} (clientId: ${this.clientId})`);

        // Serverless architecture: No client acts as host on the board
        this.isHost = false;

        // Save active session for seamless reconnection / rejoining
        this.saveActiveMatchSession(matchData);
        this.saveActiveMatchBoardState();

        const customNames = {};
        const playerTypes = {};
        this.matchPlayers.forEach(p => {
            if (p.isBot) {
                customNames[p.color] = p.name;
                playerTypes[p.color] = 'ai';
            } else if (p.color === this.myColor || p.id === this.clientId) {
                customNames[p.color] = `${p.name} (You) 🇧🇩`;
                playerTypes[p.color] = 'human';
            } else {
                customNames[p.color] = `${p.name} 🌐`;
                playerTypes[p.color] = 'human';
            }
        });

        const activeColors = ['red', 'green', 'yellow', 'blue'];
        const boardTitle = matchData.boardName || 'ঢাকা এরিনা';
        const humanCount = this.matchPlayers.filter(p => !p.isBot).length;
        const botCount = this.matchPlayers.filter(p => p.isBot).length;
        const modeTitle = `⚡ ${boardTitle} (${humanCount}P + ${botCount} Bot)`;

        this.showMatchStartShowdown(boardTitle, this.myColor, humanCount, botCount);

        const hud = document.getElementById('onlineMatchLiveHud');
        if (hud) hud.style.display = 'flex';
        if (typeof document !== 'undefined') {
            document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'inline-flex');
            document.body?.classList?.add('online-match-active');
        }

        // Launch game engine in online mode
        try {
            if (typeof ui.launchGameWithMode === 'function') {
                ui.launchGameWithMode('CLASSIC', 'online', modeTitle, 4, customNames, false, activeColors, playerTypes);
            }
        } catch (e) {
            console.error('[Supabase Realtime] Game launch error:', e);
        }

        if (typeof ui.initCanvasSize === 'function') ui.initCanvasSize();
        if (typeof ui.render === 'function') ui.render();

        this.startHeartbeat();
        this.startMatchWatchdog();
        this.currentTurnColor = matchData.startingTurn || 'red';
        this.handleTurnChanged(this.currentTurnColor);
    }

    showMatchStartShowdown(boardName, myColor, humanCount, botCount) {
        const overlay = document.createElement('div');
        overlay.className = 'match-start-showdown-overlay';
        overlay.innerHTML = `
            <div class="showdown-box">
                <div class="showdown-badge">⚡ লাইভ মাল্টিপ্লেয়ার ম্যাচ!</div>
                <h2 class="showdown-title">${boardName}</h2>
                <div class="showdown-sub">অনলাইন প্লেয়ার: ${humanCount} জন • বট: ${botCount} জন</div>
                <div class="showdown-sub" style="margin-top: 6px;">আপনার রঙ: <span style="color: ${myColor}; font-weight: 900; font-size: 1.15rem;">${myColor.toUpperCase()}</span></div>
                <div class="showdown-glow-ring"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => overlay.classList.add('active'));
        } else {
            overlay.classList.add('active');
        }
        setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 400);
        }, 1400);
    }

    // -------------------------------------------------------------
    // Synchronized Realtime Dice Rolling (Simultaneous Roll Prevention)
    // -------------------------------------------------------------
    rollDice(isAuto = false) {
        if (!this.isOnlineMatch) return false;

        // 1. Strict Active Turn Lock: Only the active player can roll
        if (this.currentTurnColor !== this.myColor) {
            if (!isAuto) this.showToast('এখন আপনার চাল নয়!');
            return false;
        }

        // If local player had Auto Play active and taps their dice manually, turn Auto Play OFF!
        if (!isAuto && this.botColors && this.botColors.includes(this.myColor)) {
            console.log(`[rollDice] User tapped dice while in bot mode. Disabling Auto Play...`);
            this.restoreBotToPlayer(this.myColor);
            this.broadcast('PLAYER_RESUMED_MANUAL', { color: this.myColor });
        }

        // 2. Prevent Double Rolling
        if (this.isRolling) return false;
        this.isRolling = true;

        // Clear Stage A Dice Roll Timer immediately
        this.clearTurnTimers();

        // In Authoritative Server Mode: Server determines roll and broadcasts
        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('ROLL_DICE', { color: this.myColor });
            setTimeout(() => { this.isRolling = false; }, 600);
            return true;
        }

        const ui = this.getUI();
        if (!ui || !ui.engine) return false;

        // Secure Cryptographic & Rule-Compliant Roll (1 to 6)
        const rollPlayer = ui.engine.players.find(p => p.id === this.myColor) || ui.engine.getCurrentPlayer();
        const roll = (ui.engine && typeof ui.engine.generateDiceValue === 'function') 
            ? ui.engine.generateDiceValue(rollPlayer) 
            : (Math.floor(Math.random() * 6) + 1);

        // Broadcast to all other players on Supabase Realtime
        this.broadcast('DICE_ROLLED', {
            color: this.myColor,
            roll: roll,
            isSix: (roll === 6),
            isAuto: isAuto
        });

        // Execute local roll animation & engine sync
        if (typeof ui.executeOnlineRoll === 'function') {
            ui.executeOnlineRoll(this.myColor, roll, isAuto);
        }

        setTimeout(() => {
            this.isRolling = false;
        }, 800);

        return true;
    }

    handleRemoteDiceRolled(data) {
        const ui = this.getUI();
        if (!ui || !ui.engine) return;

        // Synchronize active turn index to roller before computing valid moves
        if (ui.engine.players && data.color) {
            const rollerIdx = ui.engine.players.findIndex(p => p.id === data.color);
            if (rollerIdx !== -1 && ui.engine.currentTurnIndex !== rollerIdx) {
                ui.engine.currentTurnIndex = rollerIdx;
            }
        }

        // Set engine state to WAITING_ROLL so that rollDice(roll) will succeed cleanly!
        ui.engine.state = 'WAITING_ROLL';

        // Play synced dice tumble animation on remote player's corner pod
        if (typeof ui.executeOnlineRoll === 'function') {
            ui.executeOnlineRoll(data.color, data.roll, !!data.isAuto);
        }
    }

    // -------------------------------------------------------------
    // Backward-Compatibility Send Method (Routes all events safely)
    // -------------------------------------------------------------
    send(type, payload = {}) {
        if (type === 'PASS_TURN') {
            this.passTurnToNext(payload.fromColor || this.currentTurnColor);
            return true;
        }
        if (type === 'MOVE_TOKEN') {
            this.moveToken(payload.tokenId, payload.color || this.myColor);
            return true;
        }
        if (type === 'ROLL_DICE') {
            return this.rollDice();
        }
        if (type === 'GET_BOARDS') {
            this.renderBoardsList(this.boards);
            return true;
        }
        return this.broadcast(type, payload);
    }

    // -------------------------------------------------------------
    // Synchronized Authoritative Token Move (All 4 Players in 100% Sync)
    // -------------------------------------------------------------
    moveToken(tokenId, color = null) {
        if (!this.isOnlineMatch) return false;
        const moveColor = color || this.myColor;

        // Clear Stage B Token Move Timer immediately
        this.clearTurnTimers();

        // In Authoritative Server Mode: Server determines move and broadcasts
        if (this.isAuthoritativeServerConnected()) {
            this.sendToServer('MOVE_TOKEN', { color: moveColor, tokenId: tokenId });
            return true;
        }

        const ui = this.getUI();
        const diceVal = ui?.engine?.diceValue || 0;

        // Calculate authoritative outcome from current engine state
        let outcome = null;
        if (ui && ui.engine && typeof ui.engine.peekMoveOutcome === 'function') {
            outcome = ui.engine.peekMoveOutcome(tokenId);
        }

        // Build authoritative board snapshot for self-healing multi-device reconciliation
        let boardSnapshot = null;
        if (ui && ui.engine && ui.engine.players && outcome) {
            boardSnapshot = ui.engine.players.map(p => ({
                id: p.id,
                finishedTokens: p.finishedTokens,
                tokens: p.tokens.map(t => {
                    const isMovingToken = (p.id === moveColor && t.id === tokenId);
                    const isCutToken = (outcome.cutTokens && outcome.cutTokens.some(ct => ct.player === p.id && ct.token === t.id));
                    return {
                        id: t.id,
                        state: isMovingToken ? outcome.targetState : (isCutToken ? 'YARD' : t.state),
                        stepCount: isMovingToken ? outcome.targetStepCount : (isCutToken ? 0 : t.stepCount),
                        trackIndex: isMovingToken ? outcome.trackIndex : (isCutToken ? -1 : t.trackIndex),
                        hasShield: isMovingToken ? !!t.hasShield : (isCutToken ? false : !!t.hasShield)
                    };
                })
            }));
        }

        const movePayload = {
            color: moveColor,
            tokenId: tokenId,
            dice: diceVal,
            targetState: outcome ? outcome.targetState : 'TRACK',
            targetStepCount: outcome ? outcome.targetStepCount : 0,
            trackIndex: outcome ? outcome.trackIndex : -1,
            cutOccurred: outcome ? outcome.cutOccurred : false,
            cutTokenInfo: outcome ? outcome.cutTokenInfo : null,
            cutTokens: outcome ? (outcome.cutTokens || []) : [],
            tokenFinished: outcome ? outcome.tokenFinished : false,
            bonusTurn: outcome ? outcome.bonusTurn : (diceVal === 6),
            boardSnapshot: boardSnapshot
        };

        // Broadcast authoritative token move to peers with full destination and cut info
        this.broadcast('TOKEN_MOVED', movePayload);

        setTimeout(() => this.saveActiveMatchBoardState(), 400);
        return true;
    }

    handleRemoteTokenMoved(data) {
        const ui = this.getUI();
        if (!ui || !ui.engine) return;

        // Ensure targetState and targetStepCount aliases exist
        if (!data.targetState && data.tokenState) data.targetState = data.tokenState;
        if (data.targetStepCount === undefined && data.stepCount !== undefined) data.targetStepCount = data.stepCount;
        if (!data.dice && data.diceValue) data.dice = data.diceValue;

        // Synchronize mover turn & dice value
        if (ui.engine.players && data.color) {
            const moverIdx = ui.engine.players.findIndex(p => p.id === data.color);
            if (moverIdx !== -1 && ui.engine.currentTurnIndex !== moverIdx) {
                ui.engine.currentTurnIndex = moverIdx;
            }
        }
        if (data.dice) {
            ui.engine.diceValue = data.dice;
        }
        ui.engine.state = 'SELECTING_TOKEN';

        if (data.color !== this.myColor) {
            ui.executeMove(data.tokenId, true, data.color, data);
        } else {
            // Reconcile board snapshot for local mover as well
            if (data.stateVersion) {
                if (this._lastStateVersion && data.stateVersion < this._lastStateVersion) {
                    console.log(`[Snapshot] Stale state version ${data.stateVersion} < ${this._lastStateVersion}, skipping reconciliation.`);
                    return;
                }
                this._lastStateVersion = data.stateVersion;
            }
            if (Array.isArray(data.boardSnapshot) && ui.engine && ui.engine.players) {
                data.boardSnapshot.forEach(savedP => {
                    const liveP = ui.engine.players.find(p => p.id === savedP.color || p.id === savedP.id);
                    if (liveP && Array.isArray(savedP.tokens)) {
                        if (savedP.finishedTokens !== undefined) liveP.finishedTokens = savedP.finishedTokens;
                        savedP.tokens.forEach(savedT => {
                            const liveT = liveP.tokens.find(t => t.id === savedT.id);
                            if (liveT) {
                                liveT.state = savedT.state;
                                liveT.stepCount = (savedT.stepCount !== undefined ? savedT.stepCount : (savedT.step || 0));
                                liveT.trackIndex = savedT.trackIndex;
                                if (savedT.hasShield !== undefined) liveT.hasShield = !!savedT.hasShield;
                            }
                        });
                    }
                });
                ui.updatePlayerPods();
                ui.render();
            }
        }
        setTimeout(() => this.saveActiveMatchBoardState(), 400);
    }

    // -------------------------------------------------------------
    // Strict Turn Progression & Two-Stage 15s Timer Machine
    // -------------------------------------------------------------
    handleTurnChanged(nextTurnColor) {
        if (!nextTurnColor) return;
        // Ignore duplicate rapid TURN_CHANGED events for the exact same active roll turn
        if (this.currentTurnColor === nextTurnColor && this.currentTurnStage === 'ROLL' && (Date.now() - (this._lastTurnActivityTimestamp || 0)) < 1200) {
            return;
        }

        const ui = this.getUI();
        if (ui && ui.animatingTokens) {
            console.log(`[Turn Sync] Queuing turn change to ${nextTurnColor} while token animation is running`);
            ui.pendingTurnColor = nextTurnColor;
            return;
        }
        if (ui) {
            ui.pendingTurnColor = null;
        }

        this.currentTurnColor = nextTurnColor;
        this._lastTurnActivityTimestamp = Date.now();
        this.isRolling = false;
        const isMyTurn = (nextTurnColor === this.myColor);
        const isBotTurn = (this.botColors && this.botColors.includes(nextTurnColor));

        if (ui && ui.engine) {
            const nextIdx = ui.engine.players.findIndex(p => p.id === nextTurnColor);
            if (nextIdx !== -1) {
                ui.engine.currentTurnIndex = nextIdx;
                ui.engine.state = 'WAITING_ROLL';
                ui.engine.diceValue = 0;
                ui.engine.validMoves = [];
            }
            ui.updatePlayerPods();
            ui.render();
        }

        const banner = document.getElementById('turnBanner');
        if (banner) {
            if (isMyTurn) {
                banner.textContent = '👉 আপনার চাল! ডাইসে চাপ দিন';
            } else if (isBotTurn) {
                banner.textContent = `🤖 রোবটের চাল (${nextTurnColor.toUpperCase()})...`;
            } else {
                banner.textContent = `⏳ প্রতিপক্ষের চাল (${nextTurnColor.toUpperCase()})...`;
            }
        }

        // Lock/Unlock Dice Pointer Events and clean resting states
        ['red', 'green', 'yellow', 'blue'].forEach(c => {
            const box = document.getElementById(`dice_box_${c}`);
            const cube = document.getElementById(`cube_${c}`);
            const sc = (cube && typeof cube.closest === 'function') ? cube.closest('.dice-3d-scene') : null;

            if (box) {
                if (c === nextTurnColor && isMyTurn) {
                    box.style.pointerEvents = 'auto';
                    box.style.cursor = 'pointer';
                } else {
                    box.style.pointerEvents = 'none';
                    box.style.cursor = 'default';
                }
                box.classList.remove('rolling');
            }
            if (sc) sc.classList.remove('rolling-shake');
            if (cube) cube.classList.remove('tumble-roll');
        });

        // Start Stage A: 15-Second Dice Roll Timer
        this.startStageADiceRoll(nextTurnColor, ++this.currentTurnSeq);

        // Serverless deterministic bot turns: runs identically on all clients without host dependency!
        if (isBotTurn) {
            if (this.botRollTimeout) clearTimeout(this.botRollTimeout);
            this.botRollTimeout = setTimeout(() => {
                this.executeDeterministicBotTurn(nextTurnColor);
            }, 750);
        }
    }

    /**
     * Stage A: 15-Second Dice Roll Timer
     */
    startStageADiceRoll(color, turnSeq, customDeadline = null) {
        if (!this.isOnlineMatch) return;
        this.clearTurnTimers();

        this.currentTurnStage = 'ROLL';
        this.currentTurnSeq = turnSeq;
        this.stageActionExecuted = false;
        this.stageDeadlineMs = customDeadline || (Date.now() + 15000);

        // Broadcast deadline synchronization to all clients (prevent per-second network spam)
        if (!customDeadline) {
            this.broadcast('TURN_STAGE_SYNC', {
                color: color,
                turnSeq: turnSeq,
                stage: 'ROLL',
                deadlineMs: this.stageDeadlineMs
            });
        }

        this.runLocalVisualCountdown(color, 'ROLL', this.stageDeadlineMs, turnSeq);

        const remMs = Math.max(0, this.stageDeadlineMs - Date.now());
        this.stageTimeoutId = setTimeout(() => {
            if (this.isAuthoritativeServerConnected()) {
                // Authoritative Render server triggers timeout authoritatively
                return;
            }
            if (this.isOnlineMatch && this.currentTurnSeq === turnSeq && !this.stageActionExecuted && this.currentTurnStage === 'ROLL') {
                console.log(`[Stage A Timer] Dice roll timed out for ${color}, converting to bot and executing auto-roll...`);
                this.convertPlayerToBot(color, null, true);
                if (color === this.myColor) {
                    this.broadcast('PLAYER_TIMEOUT_BOT', { color: color });
                }
                this.executeAutoRoll(color, turnSeq);
            }
        }, remMs);
    }

    /**
     * Authoritative Deterministic Auto-Roll on Stage A Timeout (Preserves bonus turns & moves)
     */
    executeAutoRoll(color, turnSeq) {
        if (!this.isOnlineMatch || this.stageActionExecuted) return;
        if (turnSeq && this.currentTurnSeq !== turnSeq) return;
        this.stageActionExecuted = true;
        this._lastTurnActivityTimestamp = Date.now();
        this.clearTurnTimers();

        const ui = this.getUI();
        if (!ui || !ui.engine) return;
        if (ui.engine.state !== 'WAITING_ROLL') return;

        const roll = this.getDeterministicRoll(this.currentRoomCode, turnSeq);
        const isLocalOwner = (color === this.myColor);
        const isConnected = this.isPeerActive(color);
        const shouldBroadcast = isLocalOwner || (this.isCurrentBotLeader() && !isConnected);

        if (shouldBroadcast) {
            this.broadcast('DICE_ROLLED', {
                color: color,
                roll: roll,
                isSix: (roll === 6),
                isAuto: true,
                turnSeq: turnSeq
            });
        }

        if (typeof ui.executeOnlineRoll === 'function') {
            ui.executeOnlineRoll(color, roll, true);
        }
    }

    /**
     * Stage B: 15-Second Token Move Timer
     */
    startStageBTokenMove(color, turnSeq, customDeadline = null) {
        if (!this.isOnlineMatch) return;
        this.clearTurnTimers();

        this.currentTurnStage = 'MOVE';
        this.currentTurnSeq = turnSeq;
        this.stageActionExecuted = false;
        this.stageDeadlineMs = customDeadline || (Date.now() + 15000);

        // Broadcast deadline synchronization to all clients
        if (!customDeadline) {
            this.broadcast('TURN_STAGE_SYNC', {
                color: color,
                turnSeq: turnSeq,
                stage: 'MOVE',
                deadlineMs: this.stageDeadlineMs
            });
        }

        this.runLocalVisualCountdown(color, 'MOVE', this.stageDeadlineMs, turnSeq);

        const remMs = Math.max(0, this.stageDeadlineMs - Date.now());
        this.stageTimeoutId = setTimeout(() => {
            if (this.isAuthoritativeServerConnected()) {
                // Authoritative Render server triggers timeout authoritatively
                return;
            }
            if (this.isOnlineMatch && this.currentTurnSeq === turnSeq && !this.stageActionExecuted && this.currentTurnStage === 'MOVE') {
                console.log(`[Stage B Timer] Token move timed out for ${color}, converting to bot and executing auto-move...`);
                this.convertPlayerToBot(color, null, true);
                if (color === this.myColor) {
                    this.broadcast('PLAYER_TIMEOUT_BOT', { color: color });
                }
                this.executeAutoMove(color, turnSeq);
            }
        }, remMs);
    }

    /**
     * Authoritative Deterministic Auto-Move on Stage B Timeout
     */
    executeAutoMove(color, turnSeq) {
        if (!this.isOnlineMatch || this.stageActionExecuted) return;
        if (turnSeq && this.currentTurnSeq !== turnSeq) return;
        this.stageActionExecuted = true;
        this._lastTurnActivityTimestamp = Date.now();
        this.clearTurnTimers();

        const ui = this.getUI();
        if (!ui || !ui.engine) return;
        if (ui.engine.state !== 'SELECTING_TOKEN') return;

        const bestTokenId = this.selectBestLegalMove(ui.engine);
        if (bestTokenId !== null && bestTokenId !== undefined) {
            console.log(`[Stage B Auto-Move] Selected best legal move token ${bestTokenId} for ${color}`);
            const isLocalOwner = (color === this.myColor);
            const isConnected = this.isPeerActive(color);
            const shouldBroadcast = isLocalOwner || (this.isCurrentBotLeader() && !isConnected);

            if (shouldBroadcast) {
                this.moveToken(bestTokenId, color);
            }
            ui.executeMove(bestTokenId, false, color);
        } else {
            console.log(`[Stage B Auto-Move] No legal move found for ${color}, passing turn`);
            this.passTurnToNext(color);
        }
    }

    /**
     * Deterministic Auto-Move Priority:
     * 1. Capture/cut opponent token
     * 2. Enter center goal (step 56)
     * 3. Exit yard onto track (EXIT_YARD)
     * 4. Land on safe star
     * 5. Furthest token on track
     */
    selectBestLegalMove(engine) {
        if (!engine || !engine.validMoves || engine.validMoves.length === 0) return null;
        const moves = engine.validMoves;
        const curPlayer = engine.getCurrentPlayer();

        // Priority 1: Capture/cut opponent token
        const cutMove = moves.find(m => {
            if (m.type === 'EXIT_YARD') return false;
            const targetTrack = m.targetTrackIndex;
            if (targetTrack === undefined || targetTrack === null) return false;
            if (typeof BOARD_DATA !== 'undefined' && BOARD_DATA.isSafeIndex(targetTrack)) return false;
            for (const p of engine.players) {
                if (p.id === curPlayer.id) continue;
                const opp = p.tokens.find(t => t.state === 'TRACK' && t.trackIndex === targetTrack);
                if (opp) return true;
            }
            return false;
        });
        if (cutMove) return cutMove.token.id;

        // Priority 2: Enter center goal
        const goalMove = moves.find(m => m.type === 'FINISH_GOAL' || (m.token.stepCount + engine.diceValue === 56));
        if (goalMove) return goalMove.token.id;

        // Priority 3: Exit yard onto track
        const exitMove = moves.find(m => m.type === 'EXIT_YARD' || m.token.state === 'YARD');
        if (exitMove) return exitMove.token.id;

        // Priority 4: Land on safe star
        const safeMove = moves.find(m => {
            const targetTrack = m.targetTrackIndex;
            return targetTrack !== undefined && typeof BOARD_DATA !== 'undefined' && BOARD_DATA.isSafeIndex(targetTrack);
        });
        if (safeMove) return safeMove.token.id;

        // Priority 5: Furthest token on track
        let furthest = moves[0];
        for (let i = 1; i < moves.length; i++) {
            if ((moves[i].token.stepCount || 0) > (furthest.token.stepCount || 0)) {
                furthest = moves[i];
            }
        }
        return furthest ? furthest.token.id : moves[0].token.id;
    }

    /**
     * Local Visual Countdown Renderer (Smooth circular ring + HUD Pill)
     */
    runLocalVisualCountdown(color, stage, deadlineMs, turnSeq) {
        if (this.stageIntervalId) clearInterval(this.stageIntervalId);

        // Deactivate all corner rings
        ['red', 'green', 'yellow', 'blue'].forEach(c => {
            const ring = document.getElementById(`timer_ring_${c}`);
            if (ring) ring.classList.remove('active', 'warning', 'critical');
        });

        const activeRing = document.getElementById(`timer_ring_${color}`);
        const activeCircle = document.getElementById(`timer_circle_${color}`);
        const activeBadge = document.getElementById(`timer_badge_${color}`);
        if (activeRing) activeRing.classList.add('active');

        // Top HUD turn timer pill
        const timerPill = document.getElementById('onlineTurnTimerPill');
        const stageIcon = document.getElementById('timerStageIcon');
        const stageSec = document.getElementById('timerStageSeconds');
        if (timerPill) timerPill.style.display = 'inline-flex';
        if (stageIcon) stageIcon.textContent = (stage === 'ROLL') ? '🎲' : '🏃';

        const updateVisual = () => {
            if (!this.isOnlineMatch || this.currentTurnSeq !== turnSeq || this.stageActionExecuted) {
                if (this.stageIntervalId) {
                    clearInterval(this.stageIntervalId);
                    this.stageIntervalId = null;
                }
                return;
            }

            const now = Date.now();
            const remMs = Math.max(0, deadlineMs - now);
            const remSec = Math.ceil(remMs / 1000);
            const fraction = Math.max(0, Math.min(1, remMs / 15000));
            const offset = 176 * (1 - fraction);

            if (activeCircle) activeCircle.style.strokeDashoffset = offset;
            if (activeBadge) activeBadge.textContent = remSec;
            if (stageSec) stageSec.textContent = `${remSec}s`;

            if (activeRing) {
                if (remSec <= 3) {
                    activeRing.classList.add('critical');
                    activeRing.classList.remove('warning');
                } else if (remSec <= 6) {
                    activeRing.classList.add('warning');
                    activeRing.classList.remove('critical');
                } else {
                    activeRing.classList.remove('warning', 'critical');
                }
            }

            // Warning audio tick for local player in last 5 seconds
            if (color === this.myColor && remSec <= 5 && remSec > 0) {
                if (!this._lastTickSec || this._lastTickSec !== remSec) {
                    this._lastTickSec = remSec;
                    window.soundFX?.playStepTick?.();
                }
            }

            if (remMs <= 0) {
                if (this.stageIntervalId) {
                    clearInterval(this.stageIntervalId);
                    this.stageIntervalId = null;
                }
            }
        };

        updateVisual();
        this.stageIntervalId = setInterval(updateVisual, 100);
    }

    /**
     * Clear all active turn timers cleanly
     */
    clearTurnTimers() {
        if (this.stageTimeoutId) {
            clearTimeout(this.stageTimeoutId);
            this.stageTimeoutId = null;
        }
        if (this.stageIntervalId) {
            clearInterval(this.stageIntervalId);
            this.stageIntervalId = null;
        }
        if (this.turnWatchdogTimer) {
            clearTimeout(this.turnWatchdogTimer);
            this.turnWatchdogTimer = null;
        }
        ['red', 'green', 'yellow', 'blue'].forEach(c => {
            const ring = document.getElementById(`timer_ring_${c}`);
            if (ring) ring.classList.remove('active', 'warning', 'critical');
        });
        const timerPill = document.getElementById('onlineTurnTimerPill');
        if (timerPill) timerPill.style.display = 'none';
    }

    /**
     * Synchronize authoritative turn stage deadline from peer
     */
    handleTurnStageSync(data) {
        if (!data || !this.isOnlineMatch) return;
        if (data.turnSeq < this.currentTurnSeq) return; // Stale

        this.currentTurnSeq = data.turnSeq;
        this.currentTurnStage = data.stage;
        this.stageDeadlineMs = data.deadlineMs;
        this.stageActionExecuted = false;

        if (data.stage === 'ROLL') {
            this.startStageADiceRoll(data.color, data.turnSeq, data.deadlineMs);
        } else if (data.stage === 'MOVE') {
            this.startStageBTokenMove(data.color, data.turnSeq, data.deadlineMs);
        }
    }

    executeDeterministicBotTurn(botColor) {
        if (!this.isOnlineMatch || this.currentTurnColor !== botColor) return;
        this._lastTurnActivityTimestamp = Date.now();
        const ui = this.getUI();
        if (!ui || !ui.engine) return;
        if (ui.engine.state !== 'WAITING_ROLL') return;

        const roll = this.getDeterministicRoll(this.currentRoomCode, this.currentTurnSeq);
        console.log(`[Deterministic Bot Turn] ${botColor} rolling sequence ${this.currentTurnSeq}: ${roll}`);

        const isLocalOwner = (botColor === this.myColor);
        const isConnected = this.isPeerActive(botColor);
        const shouldBroadcast = isLocalOwner || (this.isCurrentBotLeader() && !isConnected);

        if (shouldBroadcast) {
            this.broadcast('DICE_ROLLED', {
                color: botColor,
                roll: roll,
                isSix: (roll === 6),
                isAuto: true,
                turnSeq: this.currentTurnSeq
            });
        }

        if (typeof ui.executeOnlineRoll === 'function') {
            ui.executeOnlineRoll(botColor, roll, true);
        }
    }

    executeHostBotTurn(botColor) {
        return this.executeDeterministicBotTurn(botColor);
    }

    passTurnToNext(fromColor) {
        if (!this.isOnlineMatch) return;
        const ui = this.getUI();
        let nextColor;

        const order = ['red', 'green', 'yellow', 'blue'];
        const curIdx = order.indexOf(fromColor);
        if (curIdx === -1) {
            nextColor = 'red';
        } else {
            // Find next active player in standard clockwise cycle: RED -> GREEN -> YELLOW -> BLUE -> RED
            let checkIdx = curIdx;
            let found = false;
            for (let i = 0; i < 4; i++) {
                checkIdx = (checkIdx + 1) % 4;
                const candidateColor = order[checkIdx];
                if (ui && ui.engine && ui.engine.players) {
                    const candidatePlayer = ui.engine.players.find(p => p.id === candidateColor);
                    if (candidatePlayer) {
                        const totalTokens = (ui.engine.mode === 'QUICK_RUSH') ? 2 : 4;
                        if (candidatePlayer.finishedTokens < totalTokens) {
                            nextColor = candidateColor;
                            found = true;
                            break;
                        }
                    }
                } else {
                    nextColor = candidateColor;
                    found = true;
                    break;
                }
            }
            if (!found) {
                nextColor = order[(curIdx + 1) % 4];
            }
        }

        // When passing turn from a BOT or disconnected player, only the designated bot leader broadcasts the turn change.
        // All clients still update their own local state via handleTurnChanged.
        const isFromBot = (this.botColors && this.botColors.includes(fromColor));
        const isFromDisconnectedHuman = !this.isPeerActive(fromColor);
        let shouldBroadcast = true;
        if (isFromBot || isFromDisconnectedHuman) {
            shouldBroadcast = this.isCurrentBotLeader();
        }

        console.log(`[Online Match Authoritative Turn] Passing turn: ${fromColor} -> ${nextColor} (broadcast: ${shouldBroadcast})`);
        if (shouldBroadcast) {
            this.broadcast('TURN_CHANGED', { nextTurn: nextColor });
        }
        this.handleTurnChanged(nextColor);
    }

    // -------------------------------------------------------------
    // Realtime Floating Emotes
    // -------------------------------------------------------------
    sendEmote(emoji) {
        this.broadcast('EMOTE_RECEIVED', { emoji, color: this.myColor });
        this.showFloatingEmote(this.myColor || 'red', emoji);
    }

    showFloatingEmote(color, emoji) {
        const floater = document.createElement('div');
        floater.className = 'online-floating-emote';
        floater.textContent = emoji;
        floater.style.position = 'fixed';
        floater.style.top = '45%';
        floater.style.left = '50%';
        floater.style.transform = 'translate(-50%, -50%) scale(0.5)';
        floater.style.fontSize = '3.5rem';
        floater.style.zIndex = '9999';
        floater.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        floater.style.pointerEvents = 'none';
        document.body.appendChild(floater);

        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                floater.style.transform = 'translate(-50%, -120%) scale(1.4)';
                floater.style.opacity = '1';
            });
        } else {
            floater.style.transform = 'translate(-50%, -120%) scale(1.4)';
            floater.style.opacity = '1';
        }

        setTimeout(() => {
            floater.style.opacity = '0';
            setTimeout(() => floater.remove(), 400);
        }, 1200);
    }

    showToast(msg) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.top = '15%';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'rgba(15, 23, 42, 0.95)';
        toast.style.border = '1px solid #10b981';
        toast.style.color = '#a7f3d0';
        toast.style.padding = '8px 16px';
        toast.style.borderRadius = '999px';
        toast.style.fontSize = '0.9rem';
        toast.style.fontWeight = '700';
        toast.style.zIndex = '99999';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    updateStatusBadge(isOnline) {
        const badges = document.querySelectorAll('.online-status-badge');
        badges.forEach(b => {
            if (isOnline) {
                b.style.color = '#10b981';
                b.style.background = 'rgba(16, 185, 129, 0.15)';
                b.innerHTML = `<span class="status-pulse-dot" style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; display: inline-block; margin-right: 6px;"></span> Server Connected`;
            } else {
                b.style.color = '#f59e0b';
                b.style.background = 'rgba(245, 158, 11, 0.15)';
                b.innerHTML = `<span class="status-pulse-dot" style="width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; display: inline-block; margin-right: 6px;"></span> Connecting Server...`;
            }
        });

        const waitingCloudText = document.getElementById('waitingRoomLiveCloudText');
        if (waitingCloudText) {
            waitingCloudText.textContent = isOnline ? 'Server Connected' : 'Connecting Server...';
        }
        const lobbyText = document.getElementById('lobbyLiveStatusText');
        if (lobbyText) {
            lobbyText.textContent = isOnline ? 'Server Connected' : 'Connecting Server...';
        }
    }
}

// Global Network Manager Instance & Class Export
window.NetworkManager = NetworkManager;
window.networkManager = new NetworkManager();
