// Web Audio API Sound Synthesizer for Ludo X (100% Offline, Zero external assets needed)

class SoundFX {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.bgmMuted = true;
        this.vibrationEnabled = true;
        this.voiceEnabled = true;
        this.bgmInterval = null;
        this.loadSettings();
    }

    loadSettings() {
        try {
            const sfx = localStorage.getItem('lx_sfx');
            if (sfx !== null) this.muted = (sfx === 'false');

            const bgm = localStorage.getItem('lx_bgm');
            this.bgmMuted = (bgm !== 'true'); // default OFF

            const vib = localStorage.getItem('lx_vibration');
            this.vibrationEnabled = (vib !== 'false'); // default ON

            const voice = localStorage.getItem('lx_voice');
            this.voiceEnabled = (voice !== 'false'); // default ON
        } catch (e) {}
    }

    vibrate(pattern = 40) {
        if (!this.vibrationEnabled || this.isAppPaused) return;
        if (typeof window !== 'undefined' && window.AndroidBridge && window.AndroidBridge.vibrate) {
            try {
                if (Array.isArray(pattern)) {
                    window.AndroidBridge.vibrate(pattern[0] || 40);
                } else {
                    window.AndroidBridge.vibrate(pattern);
                }
                return;
            } catch (e) {}
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {}
        }
    }

    onAppPause() {
        this.isAppPaused = true;
        if (this.ctx && this.ctx.state === 'running') {
            try { this.ctx.suspend(); } catch (e) {}
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
    }

    onAppResume() {
        this.isAppPaused = false;
        if (this.ctx && this.ctx.state === 'suspended' && !this.muted) {
            try { this.ctx.resume(); } catch (e) {}
        }
    }

    speakBengali(text) {
        if (!this.voiceEnabled) return;
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'bn-BD';
                u.rate = 1.05;
                u.pitch = 1.1;
                const voices = window.speechSynthesis.getVoices();
                const bn = voices.find(v => v.lang.startsWith('bn'));
                if (bn) u.voice = bn;
                window.speechSynthesis.speak(u);
            } catch (e) {}
        }
    }

    startBGM() {
        if (this.bgmMuted) return;
        this.init();
        if (!this.ctx) return;
        if (this.bgmInterval) return;

        // Gentle, uplifting pentatonic progression
        const chords = [
            [261.63, 329.63, 392.00, 523.25], // C Major
            [220.00, 261.63, 329.63, 440.00], // A Minor
            [174.61, 220.00, 261.63, 349.23], // F Major
            [196.00, 246.94, 293.66, 392.00]  // G Major
        ];
        let chordIdx = 0;
        let noteStep = 0;

        const playTick = () => {
            if (this.bgmMuted || !this.ctx) return;
            const currentChord = chords[chordIdx];
            const freq = currentChord[noteStep % currentChord.length];
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.035, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);

            noteStep++;
            if (noteStep >= 4) {
                noteStep = 0;
                chordIdx = (chordIdx + 1) % chords.length;
            }
        };

        playTick();
        this.bgmInterval = setInterval(playTick, 340);
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }

    toggleBGM() {
        this.bgmMuted = !this.bgmMuted;
        try { localStorage.setItem('lx_bgm', (!this.bgmMuted).toString()); } catch (e) {}
        if (!this.bgmMuted) {
            this.startBGM();
        } else {
            this.stopBGM();
        }
        return !this.bgmMuted;
    }

    toggleSFX() {
        this.muted = !this.muted;
        try { localStorage.setItem('lx_sfx', (!this.muted).toString()); } catch (e) {}
        return !this.muted;
    }

    toggleVibration() {
        this.vibrationEnabled = !this.vibrationEnabled;
        try { localStorage.setItem('lx_vibration', this.vibrationEnabled.toString()); } catch (e) {}
        if (this.vibrationEnabled) this.vibrate(60);
        return this.vibrationEnabled;
    }

    toggleVoice() {
        this.voiceEnabled = !this.voiceEnabled;
        try { localStorage.setItem('lx_voice', this.voiceEnabled.toString()); } catch (e) {}
        if (this.voiceEnabled) this.speakBengali('ভয়েস চালু হয়েছে');
        return this.voiceEnabled;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playClick() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.06);
    }

    playDiceRoll() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 6; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + i * 0.04;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250 + Math.random() * 200, t);
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.035);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.04);
        }
    }

    playMove() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playCut() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // Low boom
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.36);
    }

    playSafe() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + idx * 0.06;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.16);
        });
    }

    playPowerUp() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
    }

    playVictory() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const melody = [
            { f: 523.25, d: 0.15 },
            { f: 659.25, d: 0.15 },
            { f: 783.99, d: 0.15 },
            { f: 1046.50, d: 0.35 },
            { f: 880.00, d: 0.15 },
            { f: 1046.50, d: 0.6 }
        ];
        let offset = 0;
        melody.forEach(note => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + offset;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(note.f, t);
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + note.d);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + note.d + 0.05);
            offset += note.d * 0.85;
        });
    }

    playEmojiSplat() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
    }

    playStepTick() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600 + Math.random() * 80, now);
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.04);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    playChatSound() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(780, now + 0.06);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    playClaimReward() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const freqs = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + idx * 0.06;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(0.28, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.14);
        });
    }

    playTimerTick() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.03);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.035);
    }

    playTimerAlert() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // Two quick alert pings
        [0, 0.08].forEach(offset => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(950, now + offset);
            gain.gain.setValueAtTime(0.18, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.06);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + offset);
            osc.stop(now + offset + 0.07);
        });
    }

    playRoll() {
        this.playDiceRoll();
    }

    playWin() {
        this.playVictory();
    }
}

window.soundFX = new SoundFX();
