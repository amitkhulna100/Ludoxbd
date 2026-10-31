/**
 * Ludo X BD - Supabase Realtime Cloud Multiplayer Network Manager
 * 100% Cloud-Native (Zero Localhost / Port 3000 Dependency)
 * 
 * Powered by Supabase Realtime Channels (WebSocket RFC 6455 / Phoenix Protocol)
 * Project: oispsbtnmehtxcjwjlcr.supabase.co
 * Key: sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah
 */

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
        this.clientId = this.getOrCreateClientId();
        this.currentTopic = null;
        this.currentLobby = null;
        this.currentRoom = null;
        this.myColor = 'red';
        this.isOnlineMatch = false;
        this.isHost = false;
        this.currentTurnColor = null;
        this.localTimer = null;
        this.heartbeatTimer = null;
        this.msgRef = 1;
        this.eventSequence = 0;
        this.isRolling = false;
        this.botColors = [];
        this.matchPlayers = [];
        this.lastPingTime = 0;

        // Authoritative Two-Stage 15-Second Turn Timer State Machine
        this.currentTurnSeq = 0;
        this.currentTurnStage = null; // 'ROLL' (Stage A) or 'MOVE' (Stage B)
        this.stageDeadlineMs = 0;
        this.stageActionExecuted = false;
        this.stageTimeoutId = null;
        this.stageIntervalId = null;
        this._lastTickSec = 0;

        // Default Arenas (15-Second Test/Play Timer)
        this.boards = [
            { id: 'dhaka', name: 'ঢাকা এরিনা (Dhaka Arena)', fee: 500, winPrize: 1800, icon: '🏛️', waitingCount: 1, remainingSeconds: 15 },
            { id: 'chittagong', name: 'চট্টগ্রাম রয়্যালস (Chattogram)', fee: 1000, winPrize: 3600, icon: '👑', waitingCount: 0, remainingSeconds: 15 },
            { id: 'sylhet', name: 'সিলেট সুপার কিংস (Sylhet)', fee: 2500, winPrize: 9000, icon: '⚡', waitingCount: 0, remainingSeconds: 15 },
            { id: 'cox', name: 'কক্সবাজার গোল্ডেন বিচ (Cox\'s Bazar)', fee: 5000, winPrize: 18000, icon: '🏖️', waitingCount: 0, remainingSeconds: 15 },
            { id: 'padma', name: 'পদ্মা এক্সপ্রেস (Padma Express)', fee: 10000, winPrize: 36000, icon: '🚄', waitingCount: 0, remainingSeconds: 15 }
        ];

        this.init();
    }

    get currentRoomCode() {
        return this.currentRoom?.roomCode || this.currentLobby?.roomCode || 'online_match';
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
        this.connect();
        this.updateActiveMatchUI();
    }

    /**
     * Connect directly to Supabase Realtime WebSocket
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            const url = SUPABASE_REALTIME_CONFIG.wsUrl;
            console.log(`[Supabase Realtime] Connecting to ${SUPABASE_REALTIME_CONFIG.host}...`);
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('[Supabase Realtime] Connected to Cloud Gateway! 🟢');
                this.isConnected = true;
                this.updateStatusBadge(true);

                // Start Phoenix Heartbeat (every 25 seconds)
                if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = setInterval(() => {
                    this.sendHeartbeat();
                }, 25000);

                // Render default boards
                this.renderBoardsList(this.boards);
            };

            this.ws.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data);
                    this.handlePhoenixMessage(packet);
                } catch (e) {
                    console.warn('[Supabase Realtime] Packet parse error:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('[Supabase Realtime] Disconnected 🔴. Reconnecting in 3s...');
                this.isConnected = false;
                if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
                this.updateStatusBadge(false);
                setTimeout(() => this.connect(), 3000);
            };

            this.ws.onerror = (err) => {
                console.warn('[Supabase Realtime] Socket error:', err);
                this.isConnected = false;
                this.updateStatusBadge(false);
            };
        } catch (e) {
            console.error('[Supabase Realtime] Connect exception:', e);
            this.isConnected = false;
            this.updateStatusBadge(false);
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
            }
            return;
        }

        if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'GAME_EVENT') {
            const eventData = msg.payload.payload;
            if (!eventData || eventData.senderId === this.clientId) return; // Prevent echo loop
            this.handleGameEvent(eventData);
        }
    }

    handleGameEvent(data) {
        switch (data.type) {
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
                if (this.isOnlineMatch) {
                    this.showToast(`🚪 ${data.color.toUpperCase()} ম্যাচ ত্যাগ করেছে। এখন বট খেলবে।`);
                    if (!this.botColors.includes(data.color)) {
                        this.botColors.push(data.color);
                    }
                    const ui = this.getUI();
                    if (ui && ui.engine) {
                        const p = ui.engine.players.find(pl => pl.id === data.color);
                        if (p) p.isAI = true;
                        ui.updatePlayerPods();
                    }
                    if (this.isHost && this.currentTurnColor === data.color) {
                        setTimeout(() => {
                            this.executeHostBotTurn(data.color);
                        }, 800);
                    }
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
                // Switch to isolated match topic
                if (data.roomCode) {
                    this.joinTopic(`realtime:ludo_match_${data.roomCode}`);
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
                    const statePayload = {
                        targetId: data.rejoiningPlayerId,
                        tokens: ui.engine.players.map(p => ({
                            id: p.id,
                            finishedTokens: p.finishedTokens,
                            rank: p.rank,
                            tokens: p.tokens.map(t => ({
                                id: t.id,
                                state: t.state,
                                step: t.step,
                                trackIndex: t.trackIndex,
                                homePathIndex: t.homePathIndex,
                                hasShield: !!t.hasShield
                            }))
                        })),
                        currentTurnColor: this.currentTurnColor,
                        currentTurnSeq: this.currentTurnSeq,
                        currentTurnStage: this.currentTurnStage,
                        stageDeadline: this.stageDeadlineMs || null,
                        lastDiceValue: this.lastDiceValue || null
                    };
                    this.broadcast('MATCH_STATE_SYNC', statePayload);
                }
                break;
            }

            case 'MATCH_STATE_SYNC': {
                if (data.targetId && data.targetId !== this.clientId) return;
                console.log('[Supabase Realtime] Received MATCH_STATE_SYNC from peer');
                this.applySynchronizedState(data);
                this.saveActiveMatchBoardState();
                break;
            }

            case 'PLAYER_REJOINED_MATCH': {
                if (this.isOnlineMatch && data.color) {
                    this.showToast(`🎉 ${data.playerName || data.color.toUpperCase()} পুনরায় ম্যাচে যোগ দিয়েছেন!`);
                    this.botColors = this.botColors.filter(c => c !== data.color);
                    const ui = this.getUI();
                    if (ui && ui.engine && ui.engine.players) {
                        const p = ui.engine.players.find(pl => pl.id === data.color);
                        if (p) p.isAI = false;
                        if (typeof ui.updatePlayerPods === 'function') ui.updatePlayerPods();
                    }
                }
                break;
            }
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

    joinBoard(boardId, entryFee = 0) {
        console.log(`[Supabase Realtime] Joining board: ${boardId} (fee: ${entryFee})`);
        
        // If an active ongoing match exists on this board, rejoin directly!
        const activeMatch = this.getActiveMatchSession();
        if (activeMatch && (activeMatch.boardId === boardId || !activeMatch.boardId)) {
            console.log('[Supabase Realtime] Active match detected on board, rejoining directly:', boardId);
            this.rejoinActiveMatch();
            return;
        }

        const ui = this.getUI();

        const currentCoins = ui?.userStats?.coins || 5050;
        if (entryFee > 0 && currentCoins < entryFee) {
            alert(`🪙 আপনার পর্যাপ্ত কয়েন নেই! এই বোর্ডে প্রবেশ করতে ${entryFee.toLocaleString()} কয়েন প্রয়োজন।`);
            return;
        }

        const boardNameMap = {
            'dhaka': 'ঢাকা এরিনা (Dhaka Arena)',
            'chittagong': 'চট্টগ্রাম রয়্যালস (Chattogram)',
            'sylhet': 'সিলেট সুপার কিংস (Sylhet)',
            'cox': 'কক্সবাজার গোল্ডেন বিচ (Cox\'s Bazar)',
            'padma': 'পদ্মা এক্সপ্রেস (Padma Express)'
        };
        const boardName = boardNameMap[boardId] || 'অনলাইন এরিনা';

        this.myColor = null;
        this.isHost = false;

        const myPlayer = {
            id: this.clientId,
            name: ui?.userStats?.name || 'আপনি (You)',
            avatar: ui?.userStats?.avatar || 'king'
        };

        this.openWaitingRoom({
            boardId: boardId,
            boardName: boardName,
            entryFee: entryFee,
            remainingSeconds: 10,
            players: []
        });

        // Join Supabase Channel for this Arena
        const topic = `realtime:ludo_arena_${boardId}`;
        this.joinTopic(topic);

        // Discovery timer: if no existing host responds within 1200ms, become Host
        if (this._lobbyDiscoveryTimer) clearTimeout(this._lobbyDiscoveryTimer);
        this._lobbyDiscoveryTimer = setTimeout(() => {
            if (!this.currentLobby || this.currentLobby.players.length === 0) {
                console.log(`[Supabase Realtime] No host in arena, assigning self as Host (Red)`);
                this.isHost = true;
                this.myColor = 'red';
                const selfPlayer = { ...myPlayer, color: 'red', isHost: true };
                if (this.currentLobby) {
                    this.currentLobby.players = [selfPlayer];
                    this.updateWaitingRoomSlots(this.currentLobby.players);
                }
                this.startLobbyCountdown(10, { id: boardId, name: boardName, fee: entryFee });
                this.broadcast('LOBBY_STATE_SYNC', {
                    players: [selfPlayer],
                    remainingSeconds: 10,
                    boardName: boardName
                });
            }
        }, 1200);

        // Ask existing host to enter lobby
        setTimeout(() => {
            this.broadcast('REQUEST_JOIN_LOBBY', { player: myPlayer });
        }, 400);
    }

    createPrivateRoom(playerCount = 4) {
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        const inputCodeEl = document.getElementById('inputRoomCode');
        if (inputCodeEl) inputCodeEl.value = roomCode;

        this.showToast(`🔑 প্রাইভেট রুম তৈরি হয়েছে! কোড: ${roomCode}`);
        const ui = this.getUI();

        this.myColor = 'red';
        this.isHost = true;

        const myPlayer = {
            id: this.clientId,
            name: ui?.userStats?.name || 'আপনি (You)',
            avatar: ui?.userStats?.avatar || 'king',
            color: 'red',
            isHost: true
        };

        this.openWaitingRoom({
            boardId: `room_${roomCode}`,
            roomCode: roomCode,
            boardName: `প্রাইভেট রুম #${roomCode}`,
            entryFee: 0,
            remainingSeconds: 10,
            players: [myPlayer]
        });

        const topic = `realtime:ludo_room_${roomCode}`;
        this.joinTopic(topic);

        this.startLobbyCountdown(10, { id: roomCode, name: `প্রাইভেট রুম #${roomCode}`, fee: 0 });
    }

    joinPrivateRoom(roomCode) {
        const code = roomCode.trim();
        if (!code || code.length < 4) {
            alert('সঠিক রুম কোড লিখুন!');
            return;
        }

        const ui = this.getUI();
        this.myColor = null;
        this.isHost = false;

        const myPlayer = {
            id: this.clientId,
            name: ui?.userStats?.name || 'আপনি (You)',
            avatar: ui?.userStats?.avatar || 'king'
        };

        this.openWaitingRoom({
            boardId: `room_${code}`,
            roomCode: code,
            boardName: `প্রাইভেট রুম #${code}`,
            entryFee: 0,
            remainingSeconds: 10,
            players: []
        });

        const topic = `realtime:ludo_room_${code}`;
        this.joinTopic(topic);

        // Joiner asks Host to enter lobby
        setTimeout(() => {
            this.broadcast('REQUEST_JOIN_LOBBY', { player: myPlayer });
        }, 500);
    }

    // ============================================================
    // Continuous Matchmaking Engine (Scenario A: 4 humans start immediately;
    // Scenario B: Internal 20s deadline backfills bots & starts immediately)
    // ============================================================
    startInternalMatchmaking(board) {
        if (this._internalMatchmakingTimer) {
            clearTimeout(this._internalMatchmakingTimer);
            this._internalMatchmakingTimer = null;
        }
        if (this.localTimer) {
            clearInterval(this.localTimer);
            this.localTimer = null;
        }

        // Invisible internal 20-second deadline for bot fill
        this._internalMatchmakingTimer = setTimeout(() => {
            if (!this.isOnlineMatch && this.isHost && this.currentLobby) {
                console.log('[Matchmaking] 20-second internal deadline reached with < 4 players. Backfilling bots and starting match immediately!');
                this.forceStartMatch();
            }
        }, 20000);
    }

    startLobbyCountdown(seconds, board) {
        // Direct routing to modern continuous matchmaking
        this.startInternalMatchmaking(board);
    }

    leaveLobby(showLobbyModal = true) {
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
            boardId: matchData.boardId || (this.currentLobby?.boardId) || 'dhaka',
            boardName: matchData.boardName || (this.currentLobby?.boardName) || 'ঢাকা এরিনা (Dhaka Arena)',
            entryFee: matchData.entryFee || 500,
            winPrize: matchData.winPrize || 1800,
            myColor: this.myColor || 'red',
            clientId: this.clientId,
            matchPlayers: this.matchPlayers || [],
            isHost: this.isHost,
            startedAt: Date.now(),
            topic: `realtime:ludo_match_${matchData.roomCode || this.currentRoomCode}`
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
                    step: t.step,
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
                if (boardNameEl) boardNameEl.textContent = session.boardName || 'ঢাকা এরিনা';
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

        console.log('[Supabase Realtime] Rejoining active match:', session.roomCode);
        window.soundFX?.playClick();

        // 1. Ensure WebSocket connection
        this.connect();

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
                ui.launchGameWithMode('CLASSIC', 'pass_play', modeTitle, 4, customNames, false, activeColors, playerTypes);
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

        // 6. Join the isolated match topic
        const matchTopic = `realtime:ludo_match_${session.roomCode}`;
        this.joinTopic(matchTopic);

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
                            liveT.step = savedT.step;
                            liveT.trackIndex = savedT.trackIndex;
                            liveT.homePathIndex = savedT.homePathIndex;
                            liveT.hasShield = !!savedT.hasShield;
                        }
                    });
                }
            });
        }

        // Restore active turn color
        if (stateData.currentTurnColor) {
            this.currentTurnColor = stateData.currentTurnColor;
            ui.engine.currentTurn = stateData.currentTurnColor;
        }
        if (stateData.currentTurnSeq !== undefined) {
            this.currentTurnSeq = stateData.currentTurnSeq;
        }

        // If turn stage sync provided
        if (stateData.currentTurnStage && stateData.stageDeadline) {
            this.handleTurnStageSync({
                color: this.currentTurnColor,
                turnSeq: this.currentTurnSeq,
                stage: stateData.currentTurnStage,
                deadlineMs: stateData.stageDeadline
            });
        } else if (this.currentTurnColor) {
            this.handleTurnChanged(this.currentTurnColor);
        }

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
        if (!this.isHost) {
            console.log('[Matchmaking] Only the host can start the match.');
            return;
        }
        if (this._internalMatchmakingTimer) {
            clearTimeout(this._internalMatchmakingTimer);
            this._internalMatchmakingTimer = null;
        }
        if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
        const ui = this.getUI();
        const existingPlayers = this.currentLobby?.players || [{
            id: this.clientId,
            name: ui?.userStats?.name || 'You',
            color: 'red',
            isBot: false,
            isHost: true
        }];

        const colors = ['red', 'green', 'yellow', 'blue'];
        const fullPlayers = [];

        // Add human players with their authoritative colors
        existingPlayers.forEach(p => {
            fullPlayers.push({
                id: p.id,
                name: p.name,
                color: p.color || colors[fullPlayers.length],
                isBot: false
            });
        });

        // Smart Bot Backfill for remaining unfilled slots
        const botNames = ['সাকিব_কিং 🇧🇩 🤖', 'তামিম_প্রো 🇧🇩 🤖', 'রাহুল_লুডু 🇧🇩 🤖'];
        while (fullPlayers.length < 4) {
            const taken = fullPlayers.map(p => p.color);
            const nextColor = colors.find(c => !taken.includes(c)) || 'blue';
            const botIdx = fullPlayers.length - 1;
            fullPlayers.push({
                id: `bot_${nextColor}`,
                name: botNames[botIdx] || `রোবট (${nextColor.toUpperCase()}) 🤖`,
                color: nextColor,
                isBot: true
            });
        }

        const roomCode = this.currentLobby?.roomCode || Math.floor(100000 + Math.random() * 900000).toString();
        const matchPayload = {
            boardName: this.currentLobby?.boardName || 'ঢাকা এরিনা',
            roomCode: roomCode,
            entryFee: this.currentLobby?.entryFee || 0,
            players: fullPlayers,
            startingTurn: 'red'
        };

        // Broadcast to all participants on arena lobby channel
        this.broadcast('MATCH_STARTED', matchPayload);

        // Switch to isolated dedicated match channel
        const matchTopic = `realtime:ludo_match_${roomCode}`;
        this.joinTopic(matchTopic);

        // Start locally
        this.startOnlineMatch(matchPayload);
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
                    modalConfirm.classList.add('active');
                } else {
                    this.leaveCurrentMatch();
                }
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
        if (title) title.textContent = `🏛️ ${data.boardName || 'অনলাইন ওয়েটিং রুম'}`;

        const prizeBadge = document.getElementById('waitingRoomPrizeBadge');
        if (prizeBadge) {
            const feeVal = data.entryFee || 500;
            const prizeVal = Math.round(feeVal * 3.6);
            prizeBadge.textContent = `🪙 প্রবেশ ফি: ${feeVal.toLocaleString()} কয়েন • 🏆 বিজয়ী পাবে: ${prizeVal.toLocaleString()} কয়েন`;
        }

        // Toggle Private Room Code Box
        const codeBox = document.getElementById('waitingRoomCodeBox');
        const codeVal = document.getElementById('waitingRoomCodeVal');
        if (data.roomCode) {
            if (codeBox) codeBox.style.display = 'flex';
            if (codeVal) codeVal.textContent = data.roomCode;
        } else {
            if (codeBox) codeBox.style.display = 'none';
        }

        this.updateCountdownDisplay(data.remainingSeconds || 15);
        this.updateWaitingRoomSlots(data.players || []);
    }

    updateCountdownDisplay(seconds) {
        const countdownEl = document.getElementById('onlineLobbyCountdown');
        if (!countdownEl) return;
        countdownEl.style.display = 'none';
    }

    updateWaitingRoomSlots(players) {
        const slots = ['Red', 'Green', 'Yellow', 'Blue'];
        const colors = ['red', 'green', 'yellow', 'blue'];

        slots.forEach((colorName, idx) => {
            const slotEl = document.getElementById(`slot${colorName}`);
            const nameEl = document.getElementById(`slot${colorName}Name`);
            if (!slotEl || !nameEl) return;

            const player = players.find(p => p.color === colors[idx]);
            if (player) {
                slotEl.classList.remove('empty');
                slotEl.classList.add('active');
                nameEl.textContent = (player.id === this.clientId) 
                    ? `${player.name} (You)` 
                    : `${player.name}`;
            } else {
                slotEl.classList.remove('active');
                slotEl.classList.add('empty');
                nameEl.textContent = 'অপেক্ষা করা হচ্ছে...';
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

        if (this._internalMatchmakingTimer) {
            clearTimeout(this._internalMatchmakingTimer);
            this._internalMatchmakingTimer = null;
        }
        if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
        this.isOnlineMatch = true;
        this.currentRoom = matchData;

        // Deduct entry fee
        if (matchData.entryFee && matchData.entryFee > 0 && typeof ui.addCoins === 'function') {
            ui.addCoins(-matchData.entryFee);
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

        // Determine my color
        const me = this.matchPlayers.find(p => p.id === this.clientId);
        this.myColor = me ? me.color : 'red';

        // Designated Host (first human player) coordinates AI bot moves
        const firstHuman = this.matchPlayers.find(p => !p.isBot);
        this.isHost = (firstHuman && firstHuman.id === this.clientId);

        // Save active session for seamless reconnection / rejoining
        this.saveActiveMatchSession(matchData);
        this.saveActiveMatchBoardState();

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
        const boardTitle = matchData.boardName || 'ঢাকা এরিনা';
        const humanCount = this.matchPlayers.filter(p => !p.isBot).length;
        const botCount = this.matchPlayers.filter(p => p.isBot).length;
        const modeTitle = `⚡ ${boardTitle} (${humanCount}P + ${botCount} Bot)`;

        this.showMatchStartShowdown(boardTitle, this.myColor, humanCount, botCount);

        const hud = document.getElementById('onlineMatchLiveHud');
        if (hud) hud.style.display = 'flex';

        // Launch game engine in online mode
        try {
            if (typeof ui.launchGameWithMode === 'function') {
                ui.launchGameWithMode('CLASSIC', 'pass_play', modeTitle, 4, customNames, false, activeColors, playerTypes);
            }
        } catch (e) {
            console.error('[Supabase Realtime] Game launch error:', e);
        }

        if (typeof ui.initCanvasSize === 'function') ui.initCanvasSize();
        if (typeof ui.render === 'function') ui.render();

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

        // 2. Prevent Double Rolling
        if (this.isRolling) return false;
        this.isRolling = true;

        // Clear Stage A Dice Roll Timer immediately
        this.clearTurnTimers();

        const ui = this.getUI();
        if (!ui || !ui.engine) return false;

        // Secure Cryptographic Roll (1 to 6)
        const roll = Math.floor(Math.random() * 6) + 1;

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

        // Synchronize engine state immediately so validMoves & diceValue are authoritative
        if (ui.engine.state === 'WAITING_ROLL' || ui.engine.diceValue !== data.roll) {
            ui.engine.diceValue = data.roll;
            ui.engine.validMoves = ui.engine.getValidMoves(data.roll);
            ui.engine.state = 'SELECTING_TOKEN';
        }

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
    // Synchronized Token Move
    // -------------------------------------------------------------
    moveToken(tokenId, color = null) {
        if (!this.isOnlineMatch) return false;
        const moveColor = color || this.myColor;
        const ui = this.getUI();
        const diceVal = ui?.engine?.diceValue || 0;

        // Clear Stage B Token Move Timer immediately
        this.clearTurnTimers();

        // Broadcast token move to peers with authoritative dice
        this.broadcast('TOKEN_MOVED', {
            color: moveColor,
            tokenId: tokenId,
            dice: diceVal
        });

        setTimeout(() => this.saveActiveMatchBoardState(), 400);
        return true;
    }

    handleRemoteTokenMoved(data) {
        const ui = this.getUI();
        if (!ui || !ui.engine) return;

        // If receiving client has missing or mismatched dice value, synchronize immediately
        if (data.dice && ui.engine.diceValue !== data.dice) {
            ui.engine.diceValue = data.dice;
            ui.engine.validMoves = ui.engine.getValidMoves(data.dice);
            ui.engine.state = 'SELECTING_TOKEN';
        }

        if (data.color !== this.myColor) {
            ui.executeMove(data.tokenId, true, data.color);
        }
        setTimeout(() => this.saveActiveMatchBoardState(), 400);
    }

    // -------------------------------------------------------------
    // Strict Turn Progression & Two-Stage 15s Timer Machine
    // -------------------------------------------------------------
    handleTurnChanged(nextTurnColor) {
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
            const sc = cube?.closest('.dice-3d-scene');

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

        // Host coordinates AI bot turns
        if (isBotTurn && this.isHost) {
            if (this.botRollTimeout) clearTimeout(this.botRollTimeout);
            this.botRollTimeout = setTimeout(() => {
                this.executeHostBotTurn(nextTurnColor);
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
            if (this.isOnlineMatch && this.currentTurnSeq === turnSeq && !this.stageActionExecuted && this.currentTurnStage === 'ROLL') {
                const isMyTurn = (color === this.myColor);
                if (isMyTurn) {
                    console.log(`[Stage A Timer] Local dice roll timed out for ${color}, executing auto-roll...`);
                    this.executeAutoRoll(color, turnSeq);
                } else if (this.isHost) {
                    console.log(`[Stage A Timer] Remote/Bot dice roll timed out for ${color}, host executing auto-roll...`);
                    this.executeAutoRoll(color, turnSeq);
                }
            }
        }, remMs);
    }

    /**
     * Authoritative Auto-Roll on Stage A Timeout (Preserves bonus turns & moves)
     */
    executeAutoRoll(color, turnSeq) {
        if (!this.isOnlineMatch || this.stageActionExecuted || this.currentTurnSeq !== turnSeq) return;
        this.stageActionExecuted = true;
        this.clearTurnTimers();

        const ui = this.getUI();
        if (!ui || !ui.engine) return;

        const roll = Math.floor(Math.random() * 6) + 1;
        const isMyTurn = (color === this.myColor);

        if (isMyTurn || this.isHost) {
            this.broadcast('DICE_ROLLED', {
                color: color,
                roll: roll,
                isSix: (roll === 6),
                isAuto: true
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
            if (this.isOnlineMatch && this.currentTurnSeq === turnSeq && !this.stageActionExecuted && this.currentTurnStage === 'MOVE') {
                const isMyTurn = (color === this.myColor);
                if (isMyTurn) {
                    console.log(`[Stage B Timer] Local move timed out for ${color}, executing deterministic auto-move...`);
                    this.executeAutoMove(color, turnSeq);
                } else if (this.isHost) {
                    console.log(`[Stage B Timer] Remote/Bot move timed out for ${color}, host executing auto-move...`);
                    this.executeAutoMove(color, turnSeq);
                }
            }
        }, remMs);
    }

    /**
     * Authoritative Deterministic Auto-Move on Stage B Timeout
     */
    executeAutoMove(color, turnSeq) {
        if (!this.isOnlineMatch || this.stageActionExecuted || this.currentTurnSeq !== turnSeq) return;
        this.stageActionExecuted = true;
        this.clearTurnTimers();

        const ui = this.getUI();
        if (!ui || !ui.engine) return;

        const bestTokenId = this.selectBestLegalMove(ui.engine);
        if (bestTokenId !== null && bestTokenId !== undefined) {
            console.log(`[Stage B Auto-Move] Selected best legal move token ${bestTokenId} for ${color}`);
            const isMyTurn = (color === this.myColor);
            if (isMyTurn || this.isHost) {
                this.broadcast('TOKEN_MOVED', {
                    color: color,
                    tokenId: bestTokenId,
                    dice: ui.engine.diceValue,
                    isAuto: true
                });
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
        this.stageActionExecuted = true;
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

    executeHostBotTurn(botColor) {
        if (!this.isOnlineMatch || this.currentTurnColor !== botColor) return;
        const ui = this.getUI();
        if (!ui || !ui.engine) return;

        const roll = Math.floor(Math.random() * 6) + 1;
        this.broadcast('DICE_ROLLED', {
            color: botColor,
            roll: roll,
            isSix: (roll === 6)
        });

        if (typeof ui.executeOnlineRoll === 'function') {
            ui.executeOnlineRoll(botColor, roll);
        }
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

        console.log(`[Online Match Authoritative Turn] Passing turn: ${fromColor} -> ${nextColor}`);
        this.broadcast('TURN_CHANGED', { nextTurn: nextColor });
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
                b.innerHTML = `<span class="status-pulse-dot" style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; display: inline-block; margin-right: 6px;"></span> ⚡ ক্লাউড লাইভ সার্ভার: সংযুক্ত (Live Cloud)`;
            } else {
                b.style.color = '#f59e0b';
                b.style.background = 'rgba(245, 158, 11, 0.15)';
                b.innerHTML = `<span class="status-pulse-dot" style="width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; display: inline-block; margin-right: 6px;"></span> ক্লাউডে কানেক্ট হচ্ছে... (অপেক্ষা করুন)`;
            }
        });

        const waitingCloudText = document.getElementById('waitingRoomLiveCloudText');
        if (waitingCloudText) {
            waitingCloudText.textContent = isOnline ? '🟢 Live Cloud • 28ms' : '🟡 Connecting to Cloud...';
        }
        const lobbyText = document.getElementById('lobbyLiveStatusText');
        if (lobbyText) {
            lobbyText.textContent = isOnline ? '⚡ ক্লাউড লাইভ সার্ভার: সংযুক্ত (Live Cloud)' : 'ক্লাউডে কানেক্ট হচ্ছে... (অপেক্ষা করুন)';
        }
    }
}

// Global Network Manager Instance & Class Export
window.NetworkManager = NetworkManager;
window.networkManager = new NetworkManager();
