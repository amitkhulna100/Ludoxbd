/**
 * Ludo X BD - Supabase Cloud Database & Player Profile Sync Client
 * Project: oispsbtnmehtxcjwjlcr.supabase.co
 * Key: sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah
 * 
 * Provides:
 * - Persistent Cloud Profile (Coins, Diamonds, Level, Stats, Inventory)
 * - Global Leaderboard Sync & Rankings
 * - Online Match History Logging
 * - Zero-Dependency REST Client with Offline Queue & Auto-Retry
 */

const SUPABASE_CONFIG = {
    url: 'https://oispsbtnmehtxcjwjlcr.supabase.co',
    anonKey: 'sb_publishable_VJA2iDkdeTipgBAtwA1VYg_oDXzkKah',
    endpoints: {
        health: '/auth/v1/health',
        profiles: '/rest/v1/profiles',
        leaderboard: '/rest/v1/leaderboard',
        matchHistory: '/rest/v1/match_history'
    }
};

class LudoSupabaseClient {
    constructor() {
        this.config = SUPABASE_CONFIG;
        this.isOnline = false;
        this.isTableReady = false;
        this.playerId = this.getOrCreatePlayerId();
        this.lastSyncTime = null;
        this.syncDebounceTimer = null;
        this.syncInProgress = false;

        this.init();
    }

    /**
     * Get or create a unique, persistent Player ID for Supabase syncing
     */
    getOrCreatePlayerId() {
        let pid = localStorage.getItem('lx_player_id');
        if (!pid) {
            // Check if Google Play Games ID exists
            const savedAuth = localStorage.getItem('lx_play_games_auth');
            if (savedAuth) {
                try {
                    const parsed = JSON.parse(savedAuth);
                    if (parsed && parsed.id) pid = parsed.id;
                } catch (e) {}
            }
        }
        if (!pid || pid.startsWith('lx_')) {
            const randomNum = Math.floor(100000 + Math.random() * 900000);
            pid = 'LXBD-' + randomNum;
            localStorage.setItem('lx_player_id', pid);
        }
        return pid;
    }

    /**
     * Set active player ID (e.g. after recovery/login)
     */
    setPlayerId(newPlayerId) {
        if (!newPlayerId) return;
        this.playerId = newPlayerId.trim().toUpperCase();
        localStorage.setItem('lx_player_id', this.playerId);
        this.updateUIStatus(this.isOnline, 'লগইন সম্পন্ন');
        this.triggerAutoSync();
    }

    /**
     * Standard REST request builder for Supabase PostgREST
     */
    async request(path, options = {}) {
        const url = this.config.url + path;
        const headers = {
            'apikey': this.config.anonKey,
            'Authorization': `Bearer ${this.config.anonKey}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

            const res = await fetch(url, {
                method: options.method || 'GET',
                headers: headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const isJson = (res.headers.get('content-type') || '').includes('application/json');
            const data = isJson ? await res.json() : await res.text();

            return {
                ok: res.ok,
                status: res.status,
                data: data
            };
        } catch (err) {
            return {
                ok: false,
                status: 0,
                error: err.message || 'Network error'
            };
        }
    }

    /**
     * Initialize connection and test health
     */
    async init() {
        const lastSync = localStorage.getItem('lx_supabase_last_sync');
        if (lastSync) {
            this.lastSyncTime = new Date(parseInt(lastSync, 10));
        }

        try {
            const health = await this.request(this.config.endpoints.health);
            if (health.ok) {
                this.isOnline = true;
                console.log('[Supabase] Connected to project:', this.config.url);
                this.updateUIStatus(true, 'অনলাইন ও সংযুক্ত');
            } else {
                this.isOnline = false;
                this.updateUIStatus(false, 'অফলাইন');
            }
        } catch (e) {
            this.isOnline = false;
            this.updateUIStatus(false, 'অফলাইন');
        }

        // Check if tables are created
        this.verifyTables();

        // Listen for browser online event to flush pending sync
        window.addEventListener('online', () => {
            console.log('[Supabase] Network reconnected, syncing pending data...');
            this.syncNow();
        });

        // Expose helper on window
        window.supabaseSync = () => this.syncNow(false);

        // Initial auto-sync once UI controller is loaded
        setTimeout(() => {
            this.triggerAutoSync();
        }, 2000);
    }

    /**
     * Check if the profiles table is ready in Supabase schema
     */
    async verifyTables() {
        const res = await this.request(`${this.config.endpoints.profiles}?select=id&limit=1`);
        if (res.ok) {
            this.isTableReady = true;
            this.processPendingSync();
        } else if (res.status === 404) {
            this.isTableReady = false;
            console.warn('[Supabase] Profiles table not found yet (PGRST205). Waiting for table migration.');
        }
    }

    /**
     * Sync local player profile to Supabase Cloud
     */
    async syncProfile(userStats, inventory, isSilent = true) {
        if (!userStats) return;

        const payload = {
            id: this.playerId,
            name: userStats.name || 'Pro Player BD',
            avatar: userStats.avatar || 'king',
            coins: parseInt(userStats.coins || 5050, 10),
            diamonds: parseInt(userStats.diamonds || 50, 10),
            level: parseInt(userStats.level || 1, 10),
            matches_played: parseInt(userStats.matchesPlayed || 0, 10),
            matches_won: parseInt(userStats.matchesWon || 0, 10),
            matches_lost: parseInt(userStats.matchesLost || 0, 10),
            current_streak: parseInt(userStats.currentStreak || 0, 10),
            highest_streak: parseInt(userStats.highestStreak || 0, 10),
            inventory: inventory || {
                equippedDice: 'classic',
                equippedBoard: 'dark'
            },
            updated_at: new Date().toISOString()
        };

        // Cache locally and save dedicated account backup
        localStorage.setItem('lx_supabase_local_cache', JSON.stringify(payload));
        localStorage.setItem('lx_profile_backup_' + this.playerId, JSON.stringify(payload));

        if (!this.isOnline) {
            localStorage.setItem('lx_pending_supabase_sync', JSON.stringify(payload));
            if (!isSilent) alert('অফলাইন মোড: ইন্টারনেট সংযুক্ত হলে সুপাবেজ ক্লাউডে স্বয়ংক্রিয়ভাবে সেভ হবে।');
            return;
        }

        try {
            const res = await this.request(this.config.endpoints.profiles, {
                method: 'POST',
                headers: {
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                },
                body: payload
            });

            if (res.ok) {
                this.lastSyncTime = new Date();
                localStorage.setItem('lx_supabase_last_sync', this.lastSyncTime.getTime().toString());
                localStorage.removeItem('lx_pending_supabase_sync');
                this.updateUIStatus(true, 'সফলভাবে সিঙ্ক সম্পন্ন');
                console.log('[Supabase] Profile synced successfully:', this.playerId);

                if (!isSilent) {
                    if (window.soundFX?.playClaimReward) window.soundFX.playClaimReward();
                    alert(`☁️ ক্লাউড সিঙ্ক সফল!\nপ্লেয়ার আইডি: ${this.playerId}\nকয়েন: ${payload.coins} | ডায়মন্ড: ${payload.diamonds}\nআপনার সকল প্রগ্রেস ক্লাউডে সুরক্ষিত রয়েছে।`);
                }
            } else {
                console.warn('[Supabase] Sync response not OK:', res.status, res.data);
                localStorage.setItem('lx_pending_supabase_sync', JSON.stringify(payload));
                if (!isSilent) {
                    if (res.status === 404) {
                        alert('⚠️ ক্লাউড সার্ভার সংযুক্ত, কিন্তু ব্যাকআপ টেবিল পাওয়া যায়নি। লোকাল ব্যাকআপ সুরক্ষিত আছে।');
                    } else {
                        alert(`⚠️ সিঙ্ক ত্রুটি (${res.status}): লোকাল ডিভাইসে ডাটা সেভ রাখা হয়েছে।`);
                    }
                }
            }
        } catch (e) {
            console.warn('[Supabase] Sync exception:', e);
            localStorage.setItem('lx_pending_supabase_sync', JSON.stringify(payload));
            if (!isSilent) alert('ইন্টারনেট সংযোগ বিঘ্নিত: লোকাল ডিভাইসে ডাটা সেভ রাখা হয়েছে।');
        }
    }

    /**
     * Debounced auto-sync (called when coins/stats change)
     */
    triggerAutoSync() {
        if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
        this.syncDebounceTimer = setTimeout(() => {
            const ui = window.uiController || window.ludoApp;
            if (ui && ui.userStats) {
                this.syncProfile(ui.userStats, ui.inventory, true);
            }
        }, 1500); // 1.5s debounce
    }

    /**
     * Flush pending sync if available
     */
    processPendingSync() {
        const pending = localStorage.getItem('lx_pending_supabase_sync');
        if (pending) {
            try {
                const parsed = JSON.parse(pending);
                this.syncProfile(parsed, parsed.inventory, true);
            } catch (e) {}
        }
    }

    /**
     * Fetch a player profile by unique Player ID from Supabase Cloud or local backup
     */
    async fetchProfile(targetPlayerId) {
        if (!targetPlayerId) return { ok: false, error: 'User ID is required' };
        
        let cleanId = targetPlayerId.trim().toUpperCase();
        if (/^\d{6}$/.test(cleanId)) {
            cleanId = 'LXBD-' + cleanId;
        }

        // 1. Try Supabase Cloud REST API if online
        if (this.isOnline) {
            try {
                const res = await this.request(`${this.config.endpoints.profiles}?id=eq.${encodeURIComponent(cleanId)}&select=*`);
                if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
                    console.log('[Supabase] Found profile in cloud for ID:', cleanId);
                    return {
                        ok: true,
                        source: 'cloud',
                        profile: res.data[0]
                    };
                }
            } catch (err) {
                console.warn('[Supabase] fetchProfile cloud error:', err);
            }
        }

        // 2. Check dedicated local backup storage cache
        const backupKey = 'lx_profile_backup_' + cleanId;
        const localBackup = localStorage.getItem(backupKey);
        if (localBackup) {
            try {
                const parsed = JSON.parse(localBackup);
                console.log('[Supabase] Found profile in local backup for ID:', cleanId);
                return {
                    ok: true,
                    source: 'local_backup',
                    profile: parsed
                };
            } catch (e) {}
        }

        // 3. Check active profile cache if ID matches
        const currentCached = localStorage.getItem('lx_supabase_local_cache');
        if (currentCached) {
            try {
                const parsed = JSON.parse(currentCached);
                if (parsed && parsed.id && parsed.id.toUpperCase() === cleanId) {
                    return {
                        ok: true,
                        source: 'local_cache',
                        profile: parsed
                    };
                }
            } catch (e) {}
        }

        return {
            ok: false,
            error: 'Profile not found'
        };
    }

    /**
     * Fetch global leaderboard from Supabase
     */
    async fetchLeaderboard(limit = 50) {
        if (!this.isOnline) {
            return this.getFallbackLeaderboard();
        }

        try {
            // First try view or table
            const res = await this.request(`${this.config.endpoints.profiles}?select=id,name,avatar,coins,level,matches_won,matches_played&order=coins.desc&limit=${limit}`);
            if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
                return res.data;
            }
        } catch (e) {
            console.warn('[Supabase] Leaderboard fetch error:', e);
        }

        return this.getFallbackLeaderboard();
    }

    /**
     * Fallback dynamic leaderboard when database is empty or offline
     */
    getFallbackLeaderboard() {
        const ui = window.uiController || window.ludoApp;
        const myName = ui?.userStats?.name || 'Pro Player BD';
        const myCoins = ui?.userStats?.coins || 5050;
        const myLevel = ui?.userStats?.level || 1;
        const myWon = ui?.userStats?.matchesWon || 0;

        const defaultTop = [
            { id: 'bot_1', name: 'সুলতান_লুডু 🇧🇩', avatar: 'king', coins: 1250000, level: 32, matches_won: 412 },
            { id: 'bot_2', name: 'কিং_খান_ঢাকা 🇧🇩', avatar: 'tiger', coins: 890000, level: 25, matches_won: 288 },
            { id: 'bot_3', name: 'তামান্না_কুইন 🇧🇩', avatar: 'queen', coins: 640000, level: 19, matches_won: 195 },
            { id: 'bot_4', name: 'চিটাগাং_টাইগার 🇧🇩', avatar: 'warrior', coins: 450000, level: 16, matches_won: 142 },
            { id: 'bot_5', name: 'রকস্টার_রাহুল 🇮🇳', avatar: 'ninja', coins: 310000, level: 14, matches_won: 98 },
            { id: this.playerId, name: `${myName} (আপনি)`, avatar: ui?.userStats?.avatar || 'king', coins: myCoins, level: myLevel, matches_won: myWon }
        ];

        return defaultTop.sort((a, b) => b.coins - a.coins);
    }

    /**
     * Record a completed match into Supabase match_history
     */
    async recordMatchResult(matchInfo) {
        if (!this.isOnline || !matchInfo) return;

        const payload = {
            room_code: matchInfo.roomCode || 'local',
            mode: matchInfo.mode || 'CLASSIC',
            winner_id: matchInfo.winnerId || this.playerId,
            winner_name: matchInfo.winnerName || 'Winner',
            winner_color: matchInfo.winnerColor || 'red',
            players_data: matchInfo.players || [],
            created_at: new Date().toISOString()
        };

        try {
            await this.request(this.config.endpoints.matchHistory, {
                method: 'POST',
                body: payload
            });
            console.log('[Supabase] Match history recorded successfully');
        } catch (e) {
            console.warn('[Supabase] Match history record skipped:', e);
        }
    }

    /**
     * Trigger manual sync
     */
    async syncNow(isSilent = false) {
        const ui = window.uiController || window.ludoApp;
        if (!ui || !ui.userStats) {
            if (!isSilent) alert('সিঙ্ক করার মতো ডাটা পাওয়া যায়নি।');
            return;
        }

        this.syncProfile(ui.userStats, ui.inventory, isSilent);
    }

    /**
     * Update UI indicators in Settings & Profile modals
     */
    updateUIStatus(connected, message = '') {
        const statusEls = document.querySelectorAll('.supabase-status-text');
        const badgeEls = document.querySelectorAll('.supabase-status-badge');

        statusEls.forEach(el => {
            el.innerHTML = connected 
                ? `🟢 <strong>ক্লাউড ডাটাবেজ:</strong> সংযুক্ত (${this.playerId.substring(0, 10)}...)` 
                : `🔴 <strong>ক্লাউড ডাটাবেজ:</strong> অফলাইন`;
        });

        badgeEls.forEach(el => {
            el.textContent = connected ? '🟢 Cloud Connected' : '🔴 Cloud Offline';
            el.className = 'brand-badge ' + (connected ? 'supabase-connected' : 'supabase-offline');
        });
    }
}

// Global Supabase Client Instance
window.supabaseClient = new LudoSupabaseClient();
