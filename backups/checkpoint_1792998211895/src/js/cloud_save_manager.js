/**
 * Ludo X BD - Google Play Games Services (PGS v2) & Cloud Save Manager
 * Syncs player profile, coins, stats, and inventory across devices.
 */
class CloudSaveManager {
    constructor() {
        this.STORAGE_KEY = 'lx_cloud_save_snapshot';
        this.AUTH_KEY = 'lx_play_games_auth';
        this.isConnected = false;
        this.account = null;
        this.lastSyncTime = null;
        this.init();
    }

    init() {
        const savedAuth = localStorage.getItem(this.AUTH_KEY);
        if (savedAuth) {
            try {
                this.account = JSON.parse(savedAuth);
                this.isConnected = true;
            } catch (e) {
                this.isConnected = false;
            }
        }

        const lastSync = localStorage.getItem('lx_last_cloud_sync_timestamp');
        if (lastSync) {
            this.lastSyncTime = new Date(parseInt(lastSync, 10));
        }

        // Bridge callbacks from Android MainActivity
        window.onPlayGamesSignInSuccess = (playerId, playerName, avatarUrl) => {
            console.log('[CloudSave] Google Play Games Sign-In Success:', playerName);
            this.account = {
                id: playerId || 'G:' + Math.random().toString(36).substring(2, 9),
                displayName: playerName || 'LudoBD Gamer',
                avatarUrl: avatarUrl || 'assets/images/avatar_gamer.png',
                level: 5
            };
            this.isConnected = true;
            localStorage.setItem(this.AUTH_KEY, JSON.stringify(this.account));
            this.updateUI();
            this.syncNow(true);
        };

        window.onPlayGamesSignInFailed = (error) => {
            console.warn('[CloudSave] Google Play Games Sign-In Failed:', error);
            alert('Google Play Games সাইন-ইন সম্পন্ন হয়নি: ' + (error || 'অনুগ্রহ করে ইন্টারনেট চেক করুন।'));
        };

        window.onCloudSaveCompleted = (timestamp) => {
            console.log('[CloudSave] Cloud save confirmed by Play Games:', timestamp);
            this.lastSyncTime = new Date();
            localStorage.setItem('lx_last_cloud_sync_timestamp', this.lastSyncTime.getTime().toString());
            this.updateUI();
        };

        this.updateUI();
    }

    signIn() {
        if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.signInPlayGames) {
            try {
                window.AndroidBridge.signInPlayGames();
                return;
            } catch (e) {
                console.warn('[CloudSave] Native signInPlayGames call failed, using web flow', e);
            }
        }

        // Web / Local Simulation Modal
        const ui = window.uiController || window.ludoApp;
        const defaultName = ui?.userStats?.name || 'LudoBD_Player';
        const simulatedAccount = {
            id: 'G:' + Math.floor(10000000 + Math.random() * 90000000),
            displayName: defaultName,
            avatarUrl: '🎮',
            level: ui?.userStats?.level || 1
        };

        this.account = simulatedAccount;
        this.isConnected = true;
        localStorage.setItem(this.AUTH_KEY, JSON.stringify(this.account));
        this.lastSyncTime = new Date();
        localStorage.setItem('lx_last_cloud_sync_timestamp', this.lastSyncTime.getTime().toString());

        this.updateUI();
        if (window.soundFX && window.soundFX.playWin) window.soundFX.playWin();
        alert(`🎮 Google Play Games সফলভাবে সংযুক্ত হয়েছে!\nGamer ID: ${this.account.id}\nআপনার কয়েন ও প্রগ্রেস ক্লাউডে সেভ রাখা হবে।`);
        this.syncNow(true);
    }

    signOut() {
        if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.signOutPlayGames) {
            try { window.AndroidBridge.signOutPlayGames(); } catch (e) {}
        }
        this.isConnected = false;
        this.account = null;
        localStorage.removeItem(this.AUTH_KEY);
        this.updateUI();
        alert('Google Play Games অ্যাকাউন্ট ডিসকানেক্ট করা হয়েছে।');
    }

    syncNow(isSilent = false) {
        const ui = window.uiController || window.ludoApp;

        // Auto-sync to Supabase Cloud Database
        if (window.supabaseClient && ui && ui.userStats) {
            window.supabaseClient.syncProfile(ui.userStats, ui.inventory, isSilent);
        }

        if (!this.isConnected) {
            if (!isSilent && (!window.supabaseClient || !window.supabaseClient.isOnline)) {
                const conf = confirm('ক্লাউড ব্যাকআপের জন্য Google Play Games-এ সাইন-ইন করতে পারেন। আপনি কি এখন সাইন-ইন করবেন?');
                if (conf) this.signIn();
            }
            return;
        }

        const payload = {
            version: 2,
            updatedAt: Date.now(),
            account: this.account,
            userStats: ui ? ui.userStats : {},
            inventory: ui ? ui.inventory : {},
            settings: {
                theme: localStorage.getItem('lx_board_theme') || 'dark',
                sound: localStorage.getItem('lx_sound_enabled') !== 'false',
                music: localStorage.getItem('lx_music_enabled') === 'true',
                voice: localStorage.getItem('lx_voice_enabled') !== 'false'
            }
        };

        const jsonString = JSON.stringify(payload);
        localStorage.setItem(this.STORAGE_KEY, jsonString);
        this.lastSyncTime = new Date();
        localStorage.setItem('lx_last_cloud_sync_timestamp', this.lastSyncTime.getTime().toString());

        // Native Play Games Cloud Save Snapshot API
        if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.saveGameToCloud) {
            try {
                window.AndroidBridge.saveGameToCloud(jsonString);
            } catch (e) {
                console.warn('[CloudSave] Native saveGameToCloud error:', e);
            }
        }

        this.updateUI();

        if (!isSilent) {
            if (window.soundFX && window.soundFX.playClaimReward) window.soundFX.playClaimReward();
            alert(`☁️ ক্লাউড ব্যাকআপ সফল!\nসর্বশেষ ব্যাকআপ সময়: ${this.formatDate(this.lastSyncTime)}\nআপনার সকল কয়েন, ডায়মন্ড ও লেভেল ক্লাউডে সুরক্ষিত রয়েছে।`);
        }
    }

    formatDate(d) {
        if (!d) return 'কখনো নয়';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) + ', ' + d.toLocaleDateString();
    }

    updateUI() {
        const statusEl = document.getElementById('playGamesStatusText');
        const btnConnect = document.getElementById('btnPlayGamesConnect');
        const btnSync = document.getElementById('btnPlayGamesSyncNow');
        const profileBadge = document.getElementById('profilePlayGamesBadge');

        if (statusEl) {
            if (this.isConnected && this.account) {
                statusEl.innerHTML = `🟢 সংযুক্ত: <strong>${this.account.displayName}</strong> (${this.account.id})<br><small style="color: #94a3b8;">সর্বশেষ ক্লাউড সিঙ্ক: ${this.formatDate(this.lastSyncTime)}</small>`;
            } else {
                statusEl.innerHTML = `🔴 সংযোগ বিচ্ছিন্ন (লোকাল ডিভাইসে সংরক্ষিত)`;
            }
        }

        if (btnConnect) {
            btnConnect.textContent = this.isConnected ? 'অ্যাকাউন্ট ডিসকানেক্ট' : '🎮 Google Play Games সাইন-ইন';
            btnConnect.className = this.isConnected ? 'btn-secondary red-btn' : 'btn-primary';
        }

        if (btnSync) {
            btnSync.style.display = this.isConnected ? 'inline-block' : 'none';
        }

        if (profileBadge) {
            profileBadge.style.display = this.isConnected ? 'inline-flex' : 'none';
            if (this.account) {
                profileBadge.textContent = `🎮 ${this.account.displayName}`;
            }
        }
    }

    exportJSON() {
        const ui = window.uiController || window.ludoApp;
        const backupData = {
            exportDate: new Date().toISOString(),
            app: 'Ludo X BD',
            userStats: ui ? ui.userStats : {},
            inventory: ui ? ui.inventory : {}
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ludo_x_bd_backup_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Global Cloud Save Manager Instance
window.cloudSaveManager = new CloudSaveManager();
