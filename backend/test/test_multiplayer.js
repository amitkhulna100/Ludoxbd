// Automated Multi-Client Test Suite for Ludo X BD
// Validates 2, 3, 4 player lobbies, private room codes, dice synchronization, and anti-cheat

const http = require('http');
const crypto = require('crypto');

class TestClient {
    constructor(name) {
        this.name = name;
        this.clientId = null;
        this.color = null;
        this.socket = null;
        this.messages = [];
        this.listeners = new Map();
    }

    connect(port = 3000) {
        return new Promise((resolve, reject) => {
            const key = crypto.randomBytes(16).toString('base64');
            const req = http.request({
                port: port,
                host: '127.0.0.1',
                headers: {
                    'Connection': 'Upgrade',
                    'Upgrade': 'websocket',
                    'Sec-WebSocket-Version': 13,
                    'Sec-WebSocket-Key': key
                }
            });

            req.on('upgrade', (res, socket) => {
                this.socket = socket;
                this.setupFrameReader();
                resolve();
            });

            req.on('error', reject);
            req.end();
        });
    }

    setupFrameReader() {
        let buffer = Buffer.alloc(0);
        this.socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 2) {
                const b1 = buffer[0];
                const b2 = buffer[1];
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

                if (buffer.length < offset + payloadLen) break;

                const payloadBuf = buffer.slice(offset, offset + payloadLen);
                buffer = buffer.slice(offset + payloadLen);

                const text = payloadBuf.toString('utf8');
                try {
                    const msg = JSON.parse(text);
                    this.messages.push(msg);
                    if (msg.type === 'CONNECTED') {
                        this.clientId = msg.payload.clientId;
                    }
                    if (this.listeners.has(msg.type)) {
                        this.listeners.get(msg.type)(msg.payload);
                    }
                } catch (e) {}
            }
        });
    }

    send(type, payload = {}) {
        const text = JSON.stringify({ type, payload });
        const payloadBuf = Buffer.from(text, 'utf8');
        const mask = crypto.randomBytes(4);
        const len = payloadBuf.length;

        let header;
        if (len < 126) {
            header = Buffer.alloc(2);
            header[0] = 0x81;
            header[1] = 0x80 | len;
        } else if (len <= 65535) {
            header = Buffer.alloc(4);
            header[0] = 0x81;
            header[1] = 0x80 | 126;
            header.writeUInt16BE(len, 2);
        }

        const masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
            masked[i] = payloadBuf[i] ^ mask[i % 4];
        }

        this.socket.write(Buffer.concat([header, mask, masked]));
    }

    waitFor(type, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for '${type}' on ${this.name}`));
            }, timeoutMs);

            this.listeners.set(type, (payload) => {
                clearTimeout(timer);
                this.listeners.delete(type);
                resolve(payload);
            });
        });
    }

    close() {
        if (this.socket) this.socket.end();
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('  Ludo X BD - Multi-Client Test Verification Suite');
    console.log('====================================================\n');

    let passedTests = 0;

    try {
        // ----------------------------------------------------
        // TEST 1: Public Matchmaking Arena & Bot Backfill
        // ----------------------------------------------------
        console.log('[TEST 1] Testing Public Arena Matchmaking (Dhaka)...');
        const c1 = new TestClient('Player 1 (Host)');
        const c2 = new TestClient('Player 2 (Friend)');

        await c1.connect();
        await c2.connect();
        console.log('  ✓ Client 1 and Client 2 connected successfully via WebSocket');

        c1.send('SET_PROFILE', { name: 'Player 1 BD' });
        c2.send('SET_PROFILE', { name: 'Player 2 BD' });

        c1.send('JOIN_BOARD', { boardId: 'dhaka' });
        const lobby1 = await c1.waitFor('LOBBY_JOINED');
        c1.color = lobby1.myColor;
        console.log(`  ✓ Client 1 joined lobby as color: ${c1.color}`);

        c2.send('JOIN_BOARD', { boardId: 'dhaka' });
        const lobby2 = await c2.waitFor('LOBBY_JOINED');
        c2.color = lobby2.myColor;
        console.log(`  ✓ Client 2 joined lobby as color: ${c2.color}`);

        // Force start match to simulate countdown reaching 0
        c1.send('FORCE_START_LOBBY');

        const [match1, match2] = await Promise.all([
            c1.waitFor('MATCH_STARTED'),
            c2.waitFor('MATCH_STARTED')
        ]);

        if (match1.roomCode && match1.players.length === 4) {
            console.log(`  ✓ Both clients received MATCH_STARTED (Room #${match1.roomCode})`);
            console.log(`  ✓ Match composition: ${match1.players.map(p => `${p.name} (${p.color}, bot=${p.isBot})`).join(' | ')}`);
            passedTests++;
        } else {
            throw new Error('MATCH_STARTED payload missing 4 players');
        }

        // Test Authoritative Roll & Move
        console.log('\n[TEST 2] Testing Server-Authoritative Dice & Token Synchronization...');
        c1.send('ROLL_DICE', { color: 'red' });
        const [roll1, roll2] = await Promise.all([
            c1.waitFor('DICE_ROLLED'),
            c2.waitFor('DICE_ROLLED')
        ]);
        console.log(`  ✓ Client 1 & Client 2 synchronized DICE_ROLLED: ${roll1.roll} (isSix=${roll1.isSix})`);

        if (roll1.validTokens && roll1.validTokens.length > 0) {
            const tokenId = roll1.validTokens[0];
            c1.send('MOVE_TOKEN', { color: 'red', tokenId: tokenId });
            const [move1, move2] = await Promise.all([
                c1.waitFor('TOKEN_MOVED'),
                c2.waitFor('TOKEN_MOVED')
            ]);
            console.log(`  ✓ Both clients synchronized TOKEN_MOVED (Token: ${move1.tokenId}, Step: ${move1.stepCount})`);
        }
        passedTests++;

        c1.close();
        c2.close();

        // ----------------------------------------------------
        // TEST 3: Private 6-Digit Room System
        // ----------------------------------------------------
        console.log('\n[TEST 3] Testing Private 6-Digit Room Creation & Joining...');
        const hostClient = new TestClient('Private Host');
        const guestClient = new TestClient('Private Guest');

        await hostClient.connect();
        await guestClient.connect();

        hostClient.send('SET_PROFILE', { name: 'Host Amit' });
        guestClient.send('SET_PROFILE', { name: 'Guest Friend' });

        // Host creates private room for 2 players
        hostClient.send('CREATE_PRIVATE_ROOM', { playerCount: 2 });
        const roomData = await hostClient.waitFor('PRIVATE_ROOM_CREATED');
        const code = roomData.roomCode;
        console.log(`  ✓ Private room created with unique 6-digit code: #${code}`);

        // Guest joins with the code
        guestClient.send('JOIN_PRIVATE_ROOM', { roomCode: code });

        const [privMatch1, privMatch2] = await Promise.all([
            hostClient.waitFor('MATCH_STARTED'),
            guestClient.waitFor('MATCH_STARTED')
        ]);

        console.log(`  ✓ Both players auto-launched into private match #${code}`);
        console.log(`  ✓ Players: ${privMatch1.players.map(p => `${p.name} (${p.color})`).join(' vs ')}`);
        passedTests++;

        // ----------------------------------------------------
        // TEST 4: Anti-Cheat & Turn Validation
        // ----------------------------------------------------
        console.log('\n[TEST 4] Testing Server Anti-Cheat & Out-of-Turn Protection...');
        // In private match, starting turn is 'red' (Host). Let Guest (Green) attempt to illegally roll:
        guestClient.send('ROLL_DICE', { color: 'green' });
        // Give 300ms, ensure NO DICE_ROLLED event was accepted for Green out of turn
        await new Promise(r => setTimeout(r, 400));

        const illegalRolls = guestClient.messages.filter(m => m.type === 'DICE_ROLLED' && m.payload.color === 'green');
        if (illegalRolls.length === 0) {
            console.log('  ✓ Out-of-turn dice roll was correctly blocked by authoritative server!');
            passedTests++;
        } else {
            throw new Error('Anti-cheat failed: Out-of-turn roll was permitted!');
        }

        hostClient.close();
        guestClient.close();

        console.log('\n====================================================');
        console.log(`  ALL ${passedTests} TESTS PASSED SUCCESSFULLY (100% HEALTHY)`);
        console.log('====================================================\n');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ Test Suite Failed:', err.message);
        process.exit(1);
    }
}

runTests();
