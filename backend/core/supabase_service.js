// Backend Supabase Service for Ludo X BD
// Project: oispsbtnmehtxcjwjlcr.supabase.co
// Key: sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah

const https = require('https');

const SUPABASE_CONFIG = {
    url: process.env.SUPABASE_URL || 'https://oispsbtnmehtxcjwjlcr.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || 'sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah'
};

class SupabaseService {
    static request(path, method = 'GET', body = null) {
        return new Promise((resolve) => {
            try {
                const urlObj = new URL(SUPABASE_CONFIG.url + path);
                const headers = {
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                    'Content-Type': 'application/json'
                };

                const req = https.request(urlObj, { method, headers, timeout: 5000 }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        let parsed;
                        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed });
                    });
                });

                req.on('error', (err) => {
                    resolve({ ok: false, error: err.message });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ ok: false, error: 'Request timeout' });
                });

                if (body) req.write(JSON.stringify(body));
                req.end();
            } catch (err) {
                resolve({ ok: false, error: err.message });
            }
        });
    }

    /**
     * Record completed match to Supabase match_history
     */
    static async recordMatch(roomCode, mode, winners, players) {
        const payload = {
            room_code: roomCode,
            mode: mode || 'ONLINE_MULTIPLAYER',
            winner_id: (winners && winners[0]) ? winners[0] : 'unknown',
            winner_name: (winners && winners[0]) ? winners[0] : 'Winner',
            winner_color: (winners && winners[0]) ? winners[0] : 'red',
            players_data: players || [],
            created_at: new Date().toISOString()
        };

        const res = await this.request('/rest/v1/match_history', 'POST', payload);
        if (res.ok) {
            console.log(`[Supabase Service] Match #${roomCode} recorded successfully.`);
        } else {
            // Silently log warning if table not created yet
            if (res.status === 404) {
                console.log(`[Supabase Service] Match history table not yet migrated in Supabase (404).`);
            } else {
                console.warn(`[Supabase Service] Failed to record match #${roomCode}:`, res.status, res.error || res.data);
            }
        }
    }
}

module.exports = SupabaseService;
