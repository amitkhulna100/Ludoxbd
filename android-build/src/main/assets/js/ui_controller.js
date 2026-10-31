// Ludo X UI Controller & High-DPI Canvas Board Renderer

class LudoUIController {
    constructor() {
        this.canvas = document.getElementById('ludoCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.engine = new LudoGameEngine();
        this.theme = 'galaxy';
        localStorage.setItem('lx_theme', 'galaxy');
        this.animatingTokens = false;

        this.autoPlay = false;
        this.turnDuration = 15;
        this.turnTimeLeft = 15;
        this.turnTimerId = null;
        this.isTurnTimerActive = false;
        this.turnTimerPhase = 'WAITING_ROLL';
        this.botDifficulty = 'medium';
        this.lastGameConfig = null;

        this.initUserStats();
        this.initCanvasSize();
        this.bindEvents();
        this.setTheme(this.theme);
        this.updatePlayerPods();
        this.render();
    }

    initUserStats() {
        this.userStats = {
            name: localStorage.getItem('lx_player_name') || 'Pro Player BD',
            avatar: localStorage.getItem('lx_avatar') || 'king',
            coins: parseInt(localStorage.getItem('lx_coins') || '5050', 10),
            diamonds: parseInt(localStorage.getItem('lx_diamonds') || '50', 10),
            level: parseInt(localStorage.getItem('lx_level') || '1', 10),
            matchesPlayed: parseInt(localStorage.getItem('lx_matches') || '24', 10),
            matchesWon: parseInt(localStorage.getItem('lx_won') || '18', 10)
        };
        this.updateWalletUI();
    }

    updateWalletUI() {
        const coinsEl = document.getElementById('userCoins');
        const gemsEl = document.getElementById('userDiamonds');
        const stCoinsEl = document.getElementById('statTotalCoins');
        const stMatchesEl = document.getElementById('statMatchesPlayed');
        const stWonEl = document.getElementById('statMatchesWon');
        const stWinRateEl = document.getElementById('statWinRate');
        const inputNameEl = document.getElementById('inputPlayerName');
        const levelBadgeEl = document.getElementById('userLevelBadge');
        const profileLevelEl = document.getElementById('profileLevelText');

        if (coinsEl) coinsEl.textContent = this.userStats.coins.toLocaleString();
        if (gemsEl) gemsEl.textContent = this.userStats.diamonds.toLocaleString();
        if (stCoinsEl) stCoinsEl.textContent = this.userStats.coins.toLocaleString();
        if (stMatchesEl) stMatchesEl.textContent = this.userStats.matchesPlayed;
        if (stWonEl) stWonEl.textContent = this.userStats.matchesWon;
        if (inputNameEl) inputNameEl.value = this.userStats.name;
        if (levelBadgeEl) levelBadgeEl.textContent = `⭐ ${this.userStats.level}`;
        if (profileLevelEl) profileLevelEl.textContent = `Level ${this.userStats.level}`;

        if (stWinRateEl) {
            const rate = this.userStats.matchesPlayed > 0 
                ? Math.round((this.userStats.matchesWon / this.userStats.matchesPlayed) * 100) 
                : 0;
            stWinRateEl.textContent = rate + '%';
        }

        localStorage.setItem('lx_player_name', this.userStats.name);
        localStorage.setItem('lx_coins', this.userStats.coins);
        localStorage.setItem('lx_diamonds', this.userStats.diamonds);
        localStorage.setItem('lx_level', this.userStats.level);
        localStorage.setItem('lx_matches', this.userStats.matchesPlayed);
        localStorage.setItem('lx_won', this.userStats.matchesWon);
    }

    addCoins(amt) {
        this.userStats.coins += amt;
        this.updateWalletUI();
    }

    addDiamonds(amt) {
        this.userStats.diamonds += amt;
        this.updateWalletUI();
    }

    initCanvasSize() {
        let maxWidth = 520;
        let maxHeight = 520;

        if (this.canvas.parentElement) {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            if (rect.width > 50) {
                maxWidth = rect.width - 8;
            }
        }

        // Check mobile viewport height to prevent vertical scrolling
        const vh = window.innerHeight;
        // In mobile portrait, reserve room for header (46px), top/bottom corner pods (100px), emoji bar (40px), gaps (20px) = ~206px
        const availableHeight = Math.max(300, vh - 206);
        let size = Math.min(maxWidth, availableHeight, 560);
        if (size <= 50) size = 360;

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
        this.ctx.scale(dpr, dpr);
        this.boardSize = size;
        this.cellSize = size / 15;
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.initCanvasSize();
            this.render();
        });

        // 🎯 CRITICAL: Canvas Click for Token Selection!
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Corner Personal Dice Boxes Click Listener (Ludo King Style)
        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const dBox = document.getElementById(`dice_box_${color}`);
            if (dBox) {
                dBox.addEventListener('click', () => {
                    const player = this.engine.getCurrentPlayer();
                    if (player.id === color && player.type === 'human' && this.engine.state === 'WAITING_ROLL') {
                        this.executeRoll();
                    }
                });
            }
        });


        // Desktop Side Panel Actions
        const sideBtnAuto = document.getElementById('sideBtnAutoPlay');
        if (sideBtnAuto) {
            sideBtnAuto.addEventListener('click', () => {
                this.autoPlay = !this.autoPlay;
                sideBtnAuto.textContent = `🤖 Auto Play: ${this.autoPlay ? 'ON' : 'OFF'}`;
                const btnAutoPlay = document.getElementById('btnAutoPlay');
                if (btnAutoPlay) btnAutoPlay.style.borderColor = this.autoPlay ? 'var(--accent-green)' : 'var(--cell-border)';
                if (this.autoPlay) this.checkAITurn();
            });
        }
        const sideBtnSnd = document.getElementById('sideBtnSound');
        if (sideBtnSnd) {
            sideBtnSnd.addEventListener('click', () => {
                window.soundFX.muted = !window.soundFX.muted;
                sideBtnSnd.textContent = `🔊 Sound: ${window.soundFX.muted ? 'OFF' : 'ON'}`;
                const btnSoundToggle = document.getElementById('btnSoundToggle');
                if (btnSoundToggle) btnSoundToggle.textContent = window.soundFX.muted ? '🔇' : '🔊';
            });
        }

        // Bottom Deck Roll Button Click Listener
        const btnRoll = document.getElementById('btnRoll');
        if (btnRoll) {
            btnRoll.addEventListener('click', () => {
                const player = this.engine.getCurrentPlayer();
                if (player.type === 'human' && this.engine.state === 'WAITING_ROLL') {
                    this.executeRoll();
                }
            });
        }

        // Auto Play Button (Spectator Mode)
        this.autoPlay = false;
        const btnAutoPlay = document.getElementById('btnAutoPlay');
        if (btnAutoPlay) {
            btnAutoPlay.style.borderColor = 'var(--cell-border)';
            btnAutoPlay.addEventListener('click', () => {
                this.autoPlay = !this.autoPlay;
                btnAutoPlay.style.borderColor = this.autoPlay ? 'var(--accent-green)' : 'var(--cell-border)';
                if (this.autoPlay) {
                    this.checkAITurn();
                }
            });
        }

        // ============================================================
        // 4 CORE HOME SCREEN MODE CARD HANDLERS
        // ============================================================
        const launchGameWithMode = (modeType, vsType, badgeText, customPlayerCount = 4, customNames = null, friendlyKill = false, selectedColors = null) => {
            this.lastGameConfig = { modeType, vsType, badgeText, customPlayerCount, customNames, friendlyKill, selectedColors };
            this.stopTurnTimer();
            window.soundFX.playClick();
            // Hide Home Screen, Show Game Stage
            const homeScreen = document.getElementById('homeScreen');
            const inGameElements = document.querySelectorAll('.in-game-only');
            if (homeScreen) homeScreen.classList.remove('active');
            inGameElements.forEach(el => el.style.display = (el.tagName === 'HEADER' ? 'flex' : 'flex'));

            const badge = document.getElementById('inGameModeBadge');
            if (badge) badge.textContent = badgeText;

            let playerTypes = { red: 'human', green: 'ai', yellow: 'ai', blue: 'ai' };
            if (vsType === 'pass_play') {
                playerTypes = { red: 'human', green: 'human', yellow: 'human', blue: 'human' };
            } else if (vsType === 'spectator') {
                playerTypes = { red: 'ai', green: 'ai', yellow: 'ai', blue: 'ai' };
            } else if (vsType === 'team_ai') {
                playerTypes = { red: 'human', yellow: 'ai', green: 'ai', blue: 'ai' };
            }

            let activePlayerNames = customNames;
            if (!activePlayerNames) {
                if (modeType === 'TEAM_2V2') {
                    activePlayerNames = {
                        blue: 'Team A',
                        green: 'Team A',
                        red: 'Team B',
                        yellow: 'Team B'
                    };
                } else if (vsType === 'online_ai') {
                    activePlayerNames = {
                        red: `${this.userStats?.name || 'You'} 🇧🇩`,
                        green: 'সাকিব_কিং 🇧🇩',
                        yellow: 'তামান্না_লুডু 🇧🇩',
                        blue: 'রাহুল_প্রো 🇮🇳'
                    };
                } else if (vsType === 'pass_play') {
                    activePlayerNames = {
                        red: `${this.userStats?.name || 'You'} (Red)`,
                        blue: 'Player 2 (Blue)',
                        green: 'Player 3 (Green)',
                        yellow: 'Player 4 (Yellow)'
                    };
                } else {
                    activePlayerNames = {
                        red: this.userStats?.name || 'You (Red)',
                        blue: 'Robot Blue 🤖',
                        green: 'Robot Green 🤖',
                        yellow: 'Robot Yellow 🤖'
                    };
                }
            }

            this.engine = new LudoGameEngine({
                mode: modeType,
                playerCount: (modeType === 'TEAM_2V2') ? 4 : customPlayerCount,
                playerTypes: playerTypes,
                playerNames: activePlayerNames,
                friendlyKill: friendlyKill,
                selectedColors: selectedColors
            });

            this.autoPlay = (vsType === 'spectator');
            const btnAutoPlay = document.getElementById('btnAutoPlay');
            if (btnAutoPlay) btnAutoPlay.style.borderColor = this.autoPlay ? 'var(--accent-green)' : 'var(--cell-border)';

            this.initCanvasSize();
            this.updatePlayerPods();
            this.updatePowerUpsUI();
            this.render();
            this.checkAITurn();
        };

        // 1. Play Online (Opens transparent Online Lobby)
        const btnOnline = document.getElementById('btnModeOnline');
        if (btnOnline) {
            btnOnline.addEventListener('click', () => {
                window.soundFX.playClick();
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) {
                    modalOnline.classList.add('active');
                } else {
                    launchGameWithMode('CLASSIC', 'online_ai', 'ONLINE 4P');
                }
            });
        }

        // Online Lobby Actions
        const btnOnlineQuickMatch = document.getElementById('btnOnlineQuickMatch');
        if (btnOnlineQuickMatch) {
            btnOnlineQuickMatch.addEventListener('click', () => {
                window.soundFX.playClick();
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) modalOnline.classList.remove('active');
                launchGameWithMode('CLASSIC', 'online_ai', 'ONLINE 4P');
            });
        }

        const btnOnline1v1 = document.getElementById('btnOnline1v1');
        if (btnOnline1v1) {
            btnOnline1v1.addEventListener('click', () => {
                window.soundFX.playClick();
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) modalOnline.classList.remove('active');
                launchGameWithMode('CLASSIC', 'online_ai', 'ONLINE 1v1', 2, {
                    red: `${this.userStats?.name || 'You'} 🇧🇩`,
                    blue: 'সাকিব_কিং 🇧🇩'
                }, false, ['red', 'blue']);
            });
        }

        const btnOnlinePrivateRoom = document.getElementById('btnOnlinePrivateRoom');
        if (btnOnlinePrivateRoom) {
            btnOnlinePrivateRoom.addEventListener('click', () => {
                window.soundFX.playClick();
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) modalOnline.classList.remove('active');
                const modalSocial = document.getElementById('modalSocialTab');
                if (modalSocial) modalSocial.classList.add('active');
            });
        }

        // 2. Play Team
        const btnTeam = document.getElementById('btnModeTeam');
        if (btnTeam) {
            btnTeam.addEventListener('click', () => {
                launchGameWithMode('TEAM_2V2', 'team_ai', 'TEAM 2v2 (DUO)');
            });
        }

        // 3. Play Friends (Also connects to Play N Play or Private Room)
        const btnFriends = document.getElementById('btnModeFriends');
        if (btnFriends) {
            btnFriends.addEventListener('click', () => {
                window.soundFX.playClick();
                const modalPnP = document.getElementById('modalPlayAndPlay');
                if (modalPnP) modalPnP.classList.add('active');
            });
        }

        // 4. Play with Computer (Intuitive 1v1 Red vs Robot Blue)
        const btnComputer = document.getElementById('btnModeComputer');
        if (btnComputer) {
            btnComputer.addEventListener('click', () => {
                launchGameWithMode('CLASSIC', 'vs_ai', 'VS COMPUTER (1v1)', 2, {
                    red: this.userStats?.name || 'You (Red)',
                    blue: 'Robot Blue 🤖'
                }, false, ['red', 'blue']);
            });
        }

        // 5. Pass N Play (Opens Setup Modal for 2P, 3P, 4P or Team 2v2)
        const btnPassPlay = document.getElementById('btnModePassPlay');
        const modalPnP = document.getElementById('modalPlayAndPlay');
        const btnClosePnP = document.getElementById('btnClosePnPModal');
        const btnStartPnP = document.getElementById('btnStartPnPGame');

        if (btnPassPlay && modalPnP) {
            btnPassPlay.addEventListener('click', () => {
                window.soundFX.playClick();
                modalPnP.classList.add('active');
            });
        }

        if (btnClosePnP && modalPnP) {
            btnClosePnP.addEventListener('click', () => {
                window.soundFX.playClick();
                modalPnP.classList.remove('active');
            });
        }

        if (btnStartPnP && modalPnP) {
            // Interactive Mode Rows Click Selection (Classic, Team Up, Quick)
            const pnpRows = document.querySelectorAll('.pnp-game-row');
            const pnpCountDeck = document.getElementById('pnpPlayerCountDeck');
            const hiddenRulesInput = document.getElementById('selectPnPRules');
            const hiddenCountInput = document.getElementById('selectPnPCount');

            pnpRows.forEach(row => {
                row.addEventListener('click', () => {
                    window.soundFX.playClick();
                    pnpRows.forEach(r => {
                        r.classList.remove('active');
                        const chk = r.querySelector('.toggle-circle-check');
                        if (chk) {
                            chk.classList.remove('active');
                            chk.textContent = '';
                        }
                    });

                    row.classList.add('active');
                    const myChk = row.querySelector('.toggle-circle-check');
                    if (myChk) {
                        myChk.classList.add('active');
                        myChk.textContent = '✔';
                    }

                    const rule = row.dataset.rule;
                    hiddenRulesInput.value = rule;

                    // If classic or quick, show player count pills; if team up, count is 4 (2v2)
                    if (rule === 'TEAM_2V2') {
                        if (pnpCountDeck) pnpCountDeck.style.display = 'none';
                        hiddenCountInput.value = '4';
                    } else {
                        if (pnpCountDeck) pnpCountDeck.style.display = 'flex';
                    }
                });
            });

            // Player count pills
            const countPills = document.querySelectorAll('.count-pill');
            countPills.forEach(pill => {
                pill.addEventListener('click', () => {
                    window.soundFX.playClick();
                    countPills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    hiddenCountInput.value = pill.dataset.count;
                });
            });

            // Token Carousel interactive selection
            const tokenItems = document.querySelectorAll('.token-choice-item');
            tokenItems.forEach(item => {
                item.addEventListener('click', () => {
                    if (item.classList.contains('locked')) {
                        alert('🔒 এই টোকেনটি লেভেল ৫ এ আনলক হবে!');
                        return;
                    }
                    window.soundFX.playClick();
                    tokenItems.forEach(t => {
                        t.classList.remove('active');
                        const b = t.querySelector('.token-check-badge');
                        if (b) b.remove();
                    });
                    item.classList.add('active');
                    const badge = document.createElement('div');
                    badge.className = 'token-check-badge';
                    badge.textContent = '✔';
                    item.appendChild(badge);
                });
            });

            // Next button logic: If Team Up is chosen, proceed to Team Up setup screen!
            btnStartPnP.addEventListener('click', () => {
                const rules = document.getElementById('selectPnPRules').value;
                const count = parseInt(document.getElementById('selectPnPCount').value, 10);
                window.soundFX.playClick();
                modalPnP.classList.remove('active');

                if (rules === 'TEAM_2V2') {
                    // Open the Team Up Color & Name screen!
                    const modalTeamUp = document.getElementById('modalTeamUpSetup');
                    if (modalTeamUp) modalTeamUp.classList.add('active');
                } else {
                    const playerTypes = { red: 'human', green: 'human', yellow: 'human', blue: 'human' };
                    let badgeText = `PASS N PLAY (${count}P)`;
                    if (rules === 'QUICK_RUSH') badgeText = `QUICK RUSH (${count}P)`;
                    const selCols = (count === 2) ? ['red', 'blue'] : (count === 3 ? ['red', 'green', 'blue'] : null);
                    launchGameWithMode(rules, 'pass_play', badgeText, count, null, false, selCols);
                }
            });
        }

        // ============================================================
        // TEAM UP SETUP SCREEN INTERACTIONS (MATCHING SCREENSHOT)
        // ============================================================
        const modalTeamUp = document.getElementById('modalTeamUpSetup');
        const btnCloseTeamUp = document.getElementById('btnCloseTeamUpModal');
        const wrapFriendlyKill = document.getElementById('wrapFriendlyKill');
        const chkFriendlyKill = document.getElementById('chkFriendlyKill');
        const btnStartTeamClassic = document.getElementById('btnStartTeamClassic');
        const btnStartTeamOneToken = document.getElementById('btnStartTeamOneToken');

        // Close Team Up and return to Pass N Play
        if (btnCloseTeamUp && modalTeamUp) {
            btnCloseTeamUp.addEventListener('click', () => {
                window.soundFX.playClick();
                modalTeamUp.classList.remove('active');
                const modalPnP = document.getElementById('modalPlayAndPlay');
                if (modalPnP) modalPnP.classList.add('active');
            });
        }

        // Friendly kill toggle
        if (wrapFriendlyKill && chkFriendlyKill) {
            wrapFriendlyKill.addEventListener('click', () => {
                window.soundFX.playClick();
                chkFriendlyKill.classList.toggle('checked');
            });
        }

        // Start Team Up (Play normal - all tokens in yard)
        if (btnStartTeamClassic && modalTeamUp) {
            btnStartTeamClassic.addEventListener('click', () => {
                window.soundFX.playClick();
                modalTeamUp.classList.remove('active');
                const isFriendlyKill = chkFriendlyKill ? chkFriendlyKill.classList.contains('checked') : false;
                const pNames = {
                    blue: document.getElementById('teamPlayer1')?.value || 'Team A',
                    green: document.getElementById('teamPlayer3')?.value || 'Team A',
                    red: document.getElementById('teamPlayer2')?.value || 'Team B',
                    yellow: document.getElementById('teamPlayer4')?.value || 'Team B'
                };
                launchGameWithMode('TEAM_2V2', 'pass_play', 'TEAM 2v2 (CLASSIC)', 4, pNames, isFriendlyKill);
            });
        }

        // Start Team Up (Play - One Token Out -)
        if (btnStartTeamOneToken && modalTeamUp) {
            btnStartTeamOneToken.addEventListener('click', () => {
                window.soundFX.playClick();
                modalTeamUp.classList.remove('active');
                const isFriendlyKill = chkFriendlyKill ? chkFriendlyKill.classList.contains('checked') : false;
                const pNames = {
                    blue: document.getElementById('teamPlayer1')?.value || 'Team A',
                    green: document.getElementById('teamPlayer3')?.value || 'Team A',
                    red: document.getElementById('teamPlayer2')?.value || 'Team B',
                    yellow: document.getElementById('teamPlayer4')?.value || 'Team B'
                };
                launchGameWithMode('TEAM_2V2', 'pass_play', 'TEAM 2v2 (1 TOKEN OUT)', 4, pNames, isFriendlyKill);
                // Proactively release 1 token out for each player for fast action!
                setTimeout(() => {
                    this.engine.players.forEach(p => {
                        const yardToken = p.tokens.find(t => t.state === 'YARD');
                        const pData = BOARD_DATA.PLAYERS[p.id.toUpperCase()];
                        if (yardToken && pData) {
                            yardToken.state = 'TRACK';
                            yardToken.stepCount = 0;
                            yardToken.trackIndex = pData.startIndex;
                        }
                    });
                    this.render();
                }, 300);
            });
        }

        // Back to Home Button with Confirmation Dialog
        const btnBackHome = document.getElementById('btnBackToHome');
        const modalConfirmExit = document.getElementById('modalConfirmExit');
        const btnResumeGame = document.getElementById('btnResumeGame');
        const btnConfirmQuitToHome = document.getElementById('btnConfirmQuitToHome');
        const btnCloseConfirmExit = document.getElementById('btnCloseConfirmExit');

        if (btnBackHome) {
            btnBackHome.addEventListener('click', () => {
                window.soundFX.playClick();
                if (modalConfirmExit) {
                    modalConfirmExit.classList.add('active');
                } else {
                    this.stopTurnTimer();
                    const homeScreen = document.getElementById('homeScreen');
                    const inGameElements = document.querySelectorAll('.in-game-only');
                    if (homeScreen) homeScreen.classList.add('active');
                    inGameElements.forEach(el => el.style.display = 'none');
                }
            });
        }

        if (btnResumeGame && modalConfirmExit) {
            btnResumeGame.addEventListener('click', () => {
                window.soundFX.playClick();
                modalConfirmExit.classList.remove('active');
            });
        }

        if (btnCloseConfirmExit && modalConfirmExit) {
            btnCloseConfirmExit.addEventListener('click', () => {
                window.soundFX.playClick();
                modalConfirmExit.classList.remove('active');
            });
        }

        if (btnConfirmQuitToHome && modalConfirmExit) {
            btnConfirmQuitToHome.addEventListener('click', () => {
                window.soundFX.playClick();
                modalConfirmExit.classList.remove('active');
                this.stopTurnTimer();
                const homeScreen = document.getElementById('homeScreen');
                const inGameElements = document.querySelectorAll('.in-game-only');
                if (homeScreen) homeScreen.classList.add('active');
                inGameElements.forEach(el => el.style.display = 'none');
            });
        }

        // ============================================================
        // HOME SCREEN EXTRA ACTIONS (REWARDS, SPIN & THEME)
        // ============================================================
        const btnDailyReward = document.getElementById('btnDailyReward');
        if (btnDailyReward) {
            btnDailyReward.addEventListener('click', () => {
                window.soundFX.playWin();
                const coinsEl = document.getElementById('userCoins');
                let currCoins = parseInt(coinsEl.textContent.replace(/,/g, ''), 10) || 25000;
                currCoins += 500;
                coinsEl.textContent = currCoins.toLocaleString();
                alert('🎉 অভিনন্দন! আপনি ৫০০ কয়েন ডেইলি বোনাস পেয়েছেন!');
            });
        }

        const btnLuckySpin = document.getElementById('btnLuckySpin');
        if (btnLuckySpin) {
            btnLuckySpin.addEventListener('click', () => {
                window.soundFX.playRoll();
                const rewards = ['১,০০০ কয়েন', '২টি ডায়মন্ড', 'শিল্ড পাওয়ার-আপ', 'লাকি ৬ বুস্টার', '৫০০ কয়েন'];
                const won = rewards[Math.floor(Math.random() * rewards.length)];
                setTimeout(() => {
                    window.soundFX.playWin();
                    alert(`🎡 লাকি স্পিনের ফলাফল: আপনি জিতেছেন ${won}!`);
                }, 400);
            });
        }



        const btnCoinsAdd = document.getElementById('btnCoinsAdd');
        if (btnCoinsAdd) {
            btnCoinsAdd.addEventListener('click', () => {
                window.soundFX.playWin();
                const coinsEl = document.getElementById('userCoins');
                let currCoins = parseInt(coinsEl.textContent.replace(/,/g, ''), 10) || 25000;
                currCoins += 1000;
                coinsEl.textContent = currCoins.toLocaleString();
            });
        }

        const btnGemsAdd = document.getElementById('btnGemsAdd');
        if (btnGemsAdd) {
            btnGemsAdd.addEventListener('click', () => {
                window.soundFX.playPowerUp();
                const gemsEl = document.getElementById('userDiamonds');
                let currGems = parseInt(gemsEl.textContent.replace(/,/g, ''), 10) || 150;
                currGems += 10;
                gemsEl.textContent = currGems.toLocaleString();
            });
        }

        // Mode Switcher / New Game
        const btnNewGame = document.getElementById('btnNewGame');
        if (btnNewGame) {
            btnNewGame.addEventListener('click', () => {
                document.getElementById('modalNewGame').classList.add('active');
            });
        }

        document.getElementById('btnStartCustomGame').addEventListener('click', () => {
            const mode = document.getElementById('selectMode').value;
            const count = parseInt(document.getElementById('selectPlayers').value, 10);
            const vsType = document.getElementById('selectVs').value;
            this.botDifficulty = document.getElementById('selectBotDifficulty')?.value || 'medium';

            const badgeText = (mode === 'TEAM_2V2') ? 'TEAM 2v2' : `${mode} (${count}P)`;
            launchGameWithMode(mode, vsType, badgeText, count);
            document.getElementById('modalNewGame').classList.remove('active');
        });

        // Power-Up Buttons
        document.getElementById('btnPowerShield').addEventListener('click', () => {
            const player = this.engine.getCurrentPlayer();
            // Find first active track token to shield
            const trackToken = player.tokens.find(t => t.state === 'TRACK' && !t.hasShield);
            if (trackToken) {
                if (this.engine.usePowerUp('shield', trackToken.id)) {
                    window.soundFX.playPowerUp();
                    this.updatePowerUpsUI();
                    this.render();
                }
            } else {
                alert('ট্র্যাকে থাকা গুটিতে শিল্ড ব্যবহার করুন!');
            }
        });

        document.getElementById('btnPowerReroll').addEventListener('click', () => {
            if (this.engine.usePowerUp('reroll')) {
                window.soundFX.playPowerUp();
                this.updatePowerUpsUI();
                this.updateDiceUI(this.engine.diceValue);
                this.render();
            }
        });

        document.getElementById('btnPowerJump').addEventListener('click', () => {
            if (this.engine.usePowerUp('jump')) {
                window.soundFX.playPowerUp();
                this.updatePowerUpsUI();
                this.render();
            }
        });

        // Emoji Buttons
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                this.throwEmoji(emoji);
            });
        });

        // Sound Toggle
        document.getElementById('btnSoundToggle').addEventListener('click', (e) => {
            window.soundFX.muted = !window.soundFX.muted;
            e.currentTarget.textContent = window.soundFX.muted ? '🔇' : '🔊';
        });

        // Universal modal backdrop click to close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });

        // Universal close buttons [data-close]
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.soundFX.playClick();
                const modalId = btn.dataset.close;
                const modal = document.getElementById(modalId);
                if (modal) modal.classList.remove('active');
            });
        });

        // 1. User Profile Modal & Interactions
        const btnUserProfile = document.getElementById('btnUserProfile');
        const modalUserProfile = document.getElementById('modalUserProfile');
        if (btnUserProfile && modalUserProfile) {
            btnUserProfile.addEventListener('click', () => {
                window.soundFX.playClick();
                this.updateWalletUI();
                modalUserProfile.classList.add('active');
            });
        }
        document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.soundFX.playClick();
                document.querySelectorAll('.avatar-pick-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const avatarKey = btn.dataset.avatar;
                this.userStats.avatar = avatarKey;
                localStorage.setItem('lx_avatar', avatarKey);
            });
        });
        const btnSaveName = document.getElementById('btnSaveProfileName');
        if (btnSaveName) {
            btnSaveName.addEventListener('click', () => {
                const nameInput = document.getElementById('inputPlayerName');
                if (nameInput && nameInput.value.trim()) {
                    this.userStats.name = nameInput.value.trim();
                    this.updateWalletUI();
                    window.soundFX.playWin();
                    alert('✅ প্রোফাইলের নাম সফলভাবে সংরক্ষিত হয়েছে!');
                }
            });
        }

        // 2. Settings Modal
        const btnHomeSettings = document.getElementById('btnHomeSettings');
        const modalHomeSettings = document.getElementById('modalHomeSettings');
        if (btnHomeSettings && modalHomeSettings) {
            btnHomeSettings.addEventListener('click', () => {
                window.soundFX.playClick();
                modalHomeSettings.classList.add('active');
            });
        }
        const toggleSoundSettings = document.getElementById('toggleSoundSettings');
        if (toggleSoundSettings) {
            toggleSoundSettings.addEventListener('click', () => {
                window.soundFX.muted = !window.soundFX.muted;
                toggleSoundSettings.textContent = window.soundFX.muted ? 'বন্ধ (OFF)' : 'চালু (ON)';
                toggleSoundSettings.classList.toggle('active', !window.soundFX.muted);
                const btnHeaderSound = document.getElementById('btnSoundToggle');
                if (btnHeaderSound) btnHeaderSound.textContent = window.soundFX.muted ? '🔇' : '🔊';
            });
        }
        const toggleAutoPlay = document.getElementById('toggleAutoPlaySettings');
        if (toggleAutoPlay) {
            toggleAutoPlay.addEventListener('click', () => {
                this.autoPlay = !this.autoPlay;
                toggleAutoPlay.textContent = this.autoPlay ? 'চালু (ON)' : 'বন্ধ (OFF)';
                toggleAutoPlay.classList.toggle('active', this.autoPlay);
                const btnAuto = document.getElementById('btnAutoPlay');
                if (btnAuto) btnAuto.style.borderColor = this.autoPlay ? 'var(--accent-green)' : 'var(--cell-border)';
            });
        }
        const btnOpenRulesFromSettings = document.getElementById('btnOpenRulesFromSettings');
        if (btnOpenRulesFromSettings) {
            btnOpenRulesFromSettings.addEventListener('click', () => {
                modalHomeSettings.classList.remove('active');
                const modalRules = document.getElementById('modalHelpGuide');
                if (modalRules) modalRules.classList.add('active');
            });
        }
        const btnResetGameData = document.getElementById('btnResetGameData');
        if (btnResetGameData) {
            btnResetGameData.addEventListener('click', () => {
                if (confirm('আপনি কি নিশ্চিত যে আপনার সমস্ত কয়েন ও গেম হিস্ট্রি রিসেট করতে চান?')) {
                    localStorage.clear();
                    this.initUserStats();
                    alert('গেম ডেটা সফলভাবে রিসেট হয়েছে!');
                }
            });
        }

        // 3. Mailbox Modal
        const btnMailbox = document.getElementById('btnMailbox');
        const modalMailbox = document.getElementById('modalMailbox');
        if (btnMailbox && modalMailbox) {
            btnMailbox.addEventListener('click', () => {
                window.soundFX.playClick();
                modalMailbox.classList.add('active');
            });
        }
        const btnClaimMail = document.getElementById('btnClaimMailReward');
        if (btnClaimMail) {
            btnClaimMail.addEventListener('click', () => {
                window.soundFX.playClaimReward();
                this.addCoins(500);
                btnClaimMail.textContent = 'সংগৃহীত ✔';
                btnClaimMail.classList.add('claimed');
                btnClaimMail.disabled = true;
                alert('🎉 ৫০০ উইকেন্ড বোনাস কয়েন সংগ্রহ করা হয়েছে!');
            });
        }

        // 4. Side Badges (Starter Pack, King Pass, Live TV, No Ads, Missions, Help)
        const btnStarterPack = document.getElementById('btnStarterPack');
        const modalStarterPack = document.getElementById('modalStarterPack');
        if (btnStarterPack && modalStarterPack) {
            btnStarterPack.addEventListener('click', () => {
                window.soundFX.playClick();
                modalStarterPack.classList.add('active');
            });
        }
        const btnClaimStarter = document.getElementById('btnClaimStarterPack');
        if (btnClaimStarter) {
            btnClaimStarter.addEventListener('click', () => {
                window.soundFX.playClaimReward();
                this.addCoins(50000);
                this.addDiamonds(100);
                modalStarterPack.classList.remove('active');
                this.launchConfetti();
                alert('👑 অভিনন্দন! আপনি ৫০,০০০ কয়েন এবং ১০০ ডায়মন্ড পেয়েছেন!');
            });
        }

        const btnKingPass = document.getElementById('btnKingPass');
        const modalKingPass = document.getElementById('modalKingPass');
        if (btnKingPass && modalKingPass) {
            btnKingPass.addEventListener('click', () => {
                window.soundFX.playClick();
                modalKingPass.classList.add('active');
            });
        }
        const btnActivateKingPass = document.getElementById('btnActivateKingPass');
        if (btnActivateKingPass) {
            btnActivateKingPass.addEventListener('click', () => {
                window.soundFX.playClaimReward();
                modalKingPass.classList.remove('active');
                this.launchConfetti();
                alert('👑 সিজন ২১ KING PASS সফলভাবে সক্রিয় হয়েছে!');
            });
        }

        const btnLiveTV = document.getElementById('btnLiveTV');
        const modalLiveTV = document.getElementById('modalLiveTV');
        if (btnLiveTV && modalLiveTV) {
            btnLiveTV.addEventListener('click', () => {
                window.soundFX.playClick();
                modalLiveTV.classList.add('active');
            });
        }
        const btnWatchLive = document.getElementById('btnWatchLiveMatch');
        if (btnWatchLive) {
            btnWatchLive.addEventListener('click', () => {
                modalLiveTV.classList.remove('active');
                launchGameWithMode('CLASSIC', 'spectator', 'LIVE SPECTATOR 4P');
            });
        }

        const btnNoAds = document.getElementById('btnNoAds');
        const modalNoAds = document.getElementById('modalNoAds');
        if (btnNoAds && modalNoAds) {
            btnNoAds.addEventListener('click', () => {
                window.soundFX.playClick();
                modalNoAds.classList.add('active');
            });
        }
        const btnActivateNoAds = document.getElementById('btnActivateNoAds');
        if (btnActivateNoAds) {
            btnActivateNoAds.addEventListener('click', () => {
                window.soundFX.playClaimReward();
                this.addCoins(10000);
                modalNoAds.classList.remove('active');
                alert('🚫 বিজ্ঞাপন বন্ধ করা হয়েছে এবং ১০,০০০ কয়েন জমা হয়েছে!');
            });
        }

        const btnMissions = document.getElementById('btnMissions');
        const modalMissions = document.getElementById('modalMissions');
        if (btnMissions && modalMissions) {
            btnMissions.addEventListener('click', () => {
                window.soundFX.playClick();
                modalMissions.classList.add('active');
            });
        }
        ['btnClaimMission1', 'btnClaimMission2', 'btnClaimMission3'].forEach((mId, idx) => {
            const btnM = document.getElementById(mId);
            if (btnM) {
                btnM.addEventListener('click', () => {
                    window.soundFX.playClaimReward();
                    if (idx === 0) this.addCoins(500);
                    else if (idx === 1) this.addCoins(1000);
                    else this.addDiamonds(10);
                    btnM.textContent = 'সংগৃহীত ✔';
                    btnM.classList.add('claimed');
                    btnM.disabled = true;
                });
            }
        });

        const btnHelp = document.getElementById('btnHelpGuide');
        const modalHelp = document.getElementById('modalHelpGuide');
        if (btnHelp && modalHelp) {
            btnHelp.addEventListener('click', () => {
                window.soundFX.playClick();
                modalHelp.classList.add('active');
            });
        }

        // 5. 7 Up 7 Down Mini Game
        const btn7Up = document.getElementById('btn7UpDown');
        const modal7Up = document.getElementById('modal7UpDown');
        if (btn7Up && modal7Up) {
            btn7Up.addEventListener('click', () => {
                window.soundFX.playClick();
                modal7Up.classList.add('active');
            });
        }
        let currentSevenChoice = 'seven';
        let currentSevenBet = 100;
        document.querySelectorAll('.choice-seven-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.soundFX.playClick();
                document.querySelectorAll('.choice-seven-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSevenChoice = btn.dataset.choice;
            });
        });
        document.querySelectorAll('.bet-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                window.soundFX.playClick();
                document.querySelectorAll('.bet-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentSevenBet = parseInt(chip.dataset.bet, 10);
            });
        });
        const btnRoll7 = document.getElementById('btnRoll7UpDown');
        if (btnRoll7) {
            btnRoll7.addEventListener('click', () => {
                if (this.userStats.coins < currentSevenBet) {
                    alert('আপনার কাছে পর্যাপ্ত কয়েন নেই!');
                    return;
                }
                this.addCoins(-currentSevenBet);
                window.soundFX.playDiceRoll();
                const dice1El = document.getElementById('miniDice1');
                const dice2El = document.getElementById('miniDice2');
                const sumEl = document.getElementById('miniDiceSum');
                btnRoll7.disabled = true;

                const diceIcons = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                let rolls = 0;
                const interval = setInterval(() => {
                    const d1 = Math.floor(Math.random() * 6) + 1;
                    const d2 = Math.floor(Math.random() * 6) + 1;
                    dice1El.textContent = diceIcons[d1 - 1];
                    dice2El.textContent = diceIcons[d2 - 1];
                    rolls++;
                    if (rolls > 8) {
                        clearInterval(interval);
                        const final1 = Math.floor(Math.random() * 6) + 1;
                        const final2 = Math.floor(Math.random() * 6) + 1;
                        const sum = final1 + final2;
                        dice1El.textContent = diceIcons[final1 - 1];
                        dice2El.textContent = diceIcons[final2 - 1];

                        let win = false;
                        let multiplier = 2;
                        if (currentSevenChoice === 'down' && sum < 7) { win = true; multiplier = 2; }
                        else if (currentSevenChoice === 'seven' && sum === 7) { win = true; multiplier = 3; }
                        else if (currentSevenChoice === 'up' && sum > 7) { win = true; multiplier = 2; }

                        if (win) {
                            const wonCoins = currentSevenBet * multiplier;
                            this.addCoins(wonCoins);
                            window.soundFX.playWin();
                            sumEl.textContent = `🎉 আপনি জিতেছেন ${wonCoins.toLocaleString()} কয়েন! (যোগফল: ${sum})`;
                        } else {
                            window.soundFX.playCut();
                            sumEl.textContent = `😢 আপনি হেরেছেন! (যোগফল: ${sum})`;
                        }
                        btnRoll7.disabled = false;
                    }
                }, 80);
            });
        }

        // Tournament Banner & Snakes & Ladders
        const btnTourney = document.getElementById('btnTournamentBanner');
        const modalTourney = document.getElementById('modalTournament');
        if (btnTourney && modalTourney) {
            btnTourney.addEventListener('click', () => {
                window.soundFX.playClick();
                modalTourney.classList.add('active');
            });
        }
        const btnRegTourney = document.getElementById('btnRegisterTournament');
        if (btnRegTourney) {
            btnRegTourney.addEventListener('click', () => {
                window.soundFX.playClaimReward();
                this.launchConfetti();
                modalTourney.classList.remove('active');
                alert('🎟️ সিজন ২১ গ্র্যান্ড টুর্নামেন্টে আপনার রেজিস্ট্রেশন সম্পন্ন হয়েছে!');
            });
        }

        const btnSnk = document.getElementById('btnSnakeLadder');
        const modalSnk = document.getElementById('modalSnakeLadder');
        if (btnSnk && modalSnk) {
            btnSnk.addEventListener('click', () => {
                window.soundFX.playClick();
                modalSnk.classList.add('active');
            });
        }

        // 6. Bottom Navigation Tabs
        const tabHome = document.getElementById('tabHome');
        const tabEvent = document.getElementById('tabEvent');
        const tabSocial = document.getElementById('tabSocial');
        const tabInventory = document.getElementById('tabInventory');
        const tabStore = document.getElementById('tabStore');

        const modalEventsTab = document.getElementById('modalEventsTab');
        const modalSocialTab = document.getElementById('modalSocialTab');
        const modalInventoryTab = document.getElementById('modalInventoryTab');
        const modalStoreTab = document.getElementById('modalStoreTab');

        if (tabHome) {
            tabHome.addEventListener('click', () => {
                window.soundFX.playClick();
                document.querySelectorAll('.lk-nav-tab').forEach(t => t.classList.remove('active'));
                tabHome.classList.add('active');
                const homeScreen = document.getElementById('homeScreen');
                if (homeScreen) homeScreen.classList.add('active');
                document.querySelectorAll('.in-game-only').forEach(el => el.style.display = 'none');
            });
        }
        if (tabEvent && modalEventsTab) {
            tabEvent.addEventListener('click', () => {
                window.soundFX.playClick();
                modalEventsTab.classList.add('active');
            });
        }
        if (tabSocial && modalSocialTab) {
            tabSocial.addEventListener('click', () => {
                window.soundFX.playClick();
                modalSocialTab.classList.add('active');
            });
        }
        const btnCreateRoom = document.getElementById('btnCreatePrivateRoom');
        if (btnCreateRoom) {
            btnCreateRoom.addEventListener('click', () => {
                window.soundFX.playWin();
                const code = Math.floor(100000 + Math.random() * 900000);
                const inputCode = document.getElementById('inputRoomCode');
                if (inputCode) inputCode.value = code;
                alert(`🎲 নতুন রুম তৈরি হয়েছে! কোড: ${code}\nবন্ধুদের সাথে শেয়ার করুন।`);
            });
        }
        const btnJoinRoom = document.getElementById('btnJoinPrivateRoom');
        if (btnJoinRoom) {
            btnJoinRoom.addEventListener('click', () => {
                const inputCode = document.getElementById('inputRoomCode');
                if (inputCode && inputCode.value.trim().length >= 4) {
                    modalSocialTab.classList.remove('active');
                    launchGameWithMode('CLASSIC', 'pass_play', `ROOM #${inputCode.value.trim()}`);
                } else {
                    alert('অনুগ্রহ করে সঠিক রুম কোড দিন!');
                }
            });
        }

        if (tabInventory && modalInventoryTab) {
            tabInventory.addEventListener('click', () => {
                window.soundFX.playClick();
                modalInventoryTab.classList.add('active');
            });
        }
        if (tabStore && modalStoreTab) {
            tabStore.addEventListener('click', () => {
                window.soundFX.playClick();
                modalStoreTab.classList.add('active');
            });
        }

        // Store Purchase Buttons
        const btnBuyCoins10k = document.getElementById('btnBuyCoins10k');
        if (btnBuyCoins10k) btnBuyCoins10k.addEventListener('click', () => {
            window.soundFX.playClaimReward();
            this.addCoins(10000);
            alert('🪙 ১০,০০০ কয়েন সফলভাবে যোগ করা হয়েছে!');
        });
        const btnBuyCoins50k = document.getElementById('btnBuyCoins50k');
        if (btnBuyCoins50k) btnBuyCoins50k.addEventListener('click', () => {
            window.soundFX.playClaimReward();
            this.addCoins(50000);
            alert('🪙 ৫০,০০০ কয়েন সফলভাবে যোগ করা হয়েছে!');
        });
        const btnBuyGems50 = document.getElementById('btnBuyGems50');
        if (btnBuyGems50) btnBuyGems50.addEventListener('click', () => {
            window.soundFX.playClaimReward();
            this.addDiamonds(50);
            alert('💎 ৫০ ডায়মন্ড সফলভাবে যোগ করা হয়েছে!');
        });
        const btnBuyGems200 = document.getElementById('btnBuyGems200');
        if (btnBuyGems200) btnBuyGems200.addEventListener('click', () => {
            window.soundFX.playClaimReward();
            this.addDiamonds(200);
            alert('💎 ২০০ ডায়মন্ড সফলভাবে যোগ করা হয়েছে!');
        });

        // 7. Video Ad Simulator
        const btnFreeVideoAd = document.getElementById('btnFreeVideoAd');
        const modalVideoAd = document.getElementById('modalVideoAd');
        const adCountdownText = document.getElementById('adCountdownText');
        const adProgressBar = document.getElementById('adProgressBar');
        const adStatusText = document.getElementById('adStatusText');
        const btnClaimAdReward = document.getElementById('btnClaimAdReward');
        const btnCloseVideoAd = document.getElementById('btnCloseVideoAd');

        if (btnFreeVideoAd && modalVideoAd) {
            btnFreeVideoAd.addEventListener('click', () => {
                window.soundFX.playClick();
                modalVideoAd.classList.add('active');
                if (btnClaimAdReward) btnClaimAdReward.style.display = 'none';
                if (btnCloseVideoAd) btnCloseVideoAd.style.display = 'none';
                if (adStatusText) adStatusText.textContent = 'ভিডিওটি শেষ হওয়া পর্যন্ত অপেক্ষা করুন...';
                if (adProgressBar) adProgressBar.style.width = '0%';

                setTimeout(() => {
                    if (adProgressBar) adProgressBar.style.width = '100%';
                }, 50);

                let sec = 3;
                if (adCountdownText) adCountdownText.textContent = sec;
                const adTimer = setInterval(() => {
                    sec--;
                    if (adCountdownText) adCountdownText.textContent = sec;
                    if (sec <= 0) {
                        clearInterval(adTimer);
                        window.soundFX.playWin();
                        if (adStatusText) adStatusText.textContent = '🎉 ভিডিও দেখা সম্পন্ন! রিওয়ার্ড দাবি করুন:';
                        if (btnClaimAdReward) btnClaimAdReward.style.display = 'block';
                        if (btnCloseVideoAd) btnCloseVideoAd.style.display = 'flex';
                    }
                }, 1000);
            });
        }
        if (btnClaimAdReward) {
            btnClaimAdReward.addEventListener('click', () => {
                window.soundFX.playClaimReward();
                this.addCoins(1000);
                modalVideoAd.classList.remove('active');
                alert('🎁 ১,০০০ ফ্রি কয়েন আপনার একাউন্টে জমা হয়েছে!');
            });
        }
        if (btnCloseVideoAd) {
            btnCloseVideoAd.addEventListener('click', () => {
                modalVideoAd.classList.remove('active');
            });
        }

        // 8. In-Game Quick Chat
        const btnQuickChat = document.getElementById('btnQuickChat');
        const quickChatPopup = document.getElementById('quickChatPopup');
        const btnCloseQuickChat = document.getElementById('btnCloseQuickChat');

        if (btnQuickChat && quickChatPopup) {
            btnQuickChat.addEventListener('click', () => {
                window.soundFX.playClick();
                quickChatPopup.style.display = (quickChatPopup.style.display === 'none' ? 'block' : 'none');
            });
        }
        if (btnCloseQuickChat && quickChatPopup) {
            btnCloseQuickChat.addEventListener('click', () => {
                quickChatPopup.style.display = 'none';
            });
        }
        document.querySelectorAll('.chat-quote-item').forEach(item => {
            item.addEventListener('click', () => {
                const quote = item.dataset.quote;
                quickChatPopup.style.display = 'none';
                this.showSpeechBubble(quote);
            });
        });

        // 9. Pass N Play Carousel Buttons & Theme Pill
        const tokenRow = document.querySelector('.pnp-tokens-row');
        const btnTokPrev = document.getElementById('btnTokenPrev');
        const btnTokNext = document.getElementById('btnTokenNext');
        if (btnTokPrev && tokenRow) {
            btnTokPrev.addEventListener('click', () => {
                window.soundFX.playClick();
                tokenRow.scrollBy({ left: -100, behavior: 'smooth' });
            });
        }
        if (btnTokNext && tokenRow) {
            btnTokNext.addEventListener('click', () => {
                window.soundFX.playClick();
                tokenRow.scrollBy({ left: 100, behavior: 'smooth' });
            });
        }

        // Modal Victory Actions (Rematch & Return to Home)
        const btnRematch = document.getElementById('btnRematchGame');
        if (btnRematch) {
            btnRematch.addEventListener('click', () => {
                window.soundFX.playClick();
                document.getElementById('modalVictory').classList.remove('active');
                if (this.lastGameConfig) {
                    launchGameWithMode(
                        this.lastGameConfig.modeType,
                        this.lastGameConfig.vsType,
                        this.lastGameConfig.badgeText,
                        this.lastGameConfig.customPlayerCount,
                        this.lastGameConfig.customNames,
                        this.lastGameConfig.friendlyKill
                    );
                } else {
                    launchGameWithMode('CLASSIC', 'vs_ai', 'VS COMPUTER');
                }
            });
        }

        const btnVictoryToHome = document.getElementById('btnVictoryToHome');
        if (btnVictoryToHome) {
            btnVictoryToHome.addEventListener('click', () => {
                window.soundFX.playClick();
                document.getElementById('modalVictory').classList.remove('active');
                this.stopTurnTimer();
                const homeScreen = document.getElementById('homeScreen');
                const inGameElements = document.querySelectorAll('.in-game-only');
                if (homeScreen) homeScreen.classList.add('active');
                inGameElements.forEach(el => el.style.display = 'none');
            });
        }

        const btnPlayAgain = document.getElementById('btnPlayAgain');
        if (btnPlayAgain) {
            btnPlayAgain.addEventListener('click', () => {
                document.getElementById('modalVictory').classList.remove('active');
                document.getElementById('modalNewGame').classList.add('active');
            });
        }
    }

    triggerHaptic(pattern = [30]) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // Ignore if vibration is not supported or disallowed
            }
        }
    }

    showDicePop(val, playerId) {
        const pod = document.getElementById(`corner_${playerId}`);
        if (!pod) return;
        const rect = pod.getBoundingClientRect();
        const pop = document.createElement('div');
        pop.className = 'dice-result-pop';
        pop.textContent = `🎲 ${val}`;
        const posX = Math.max(50, Math.min(window.innerWidth - 50, rect.left + rect.width / 2));
        const posY = Math.max(50, Math.min(window.innerHeight - 60, rect.top));
        pop.style.left = `${posX}px`;
        pop.style.top = `${posY}px`;
        document.body.appendChild(pop);
        setTimeout(() => pop.remove(), 550);
    }

    showCaptureFX(x, y) {
        this.triggerHaptic([60, 40, 90]);
        const slash = document.createElement('div');
        slash.className = 'capture-slash-fx';
        if (x !== undefined && y !== undefined) {
            slash.style.left = `${x}px`;
            slash.style.top = `${y}px`;
        } else {
            slash.style.left = '50%';
            slash.style.top = '50%';
        }
        document.body.appendChild(slash);
        setTimeout(() => slash.remove(), 600);
    }

    showHomeReachFX() {
        this.triggerHaptic([40, 50, 40, 50, 80]);
        this.launchConfetti();
    }

    showSpeechBubble(quote, playerColor = null) {
        window.soundFX.playChatSound();
        const curPlayer = playerColor || this.engine.getCurrentPlayer().id;
        const pod = document.getElementById(`corner_${curPlayer}`);
        if (!pod) return;

        const rect = pod.getBoundingClientRect();
        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble-pop';
        bubble.textContent = quote;
        bubble.style.left = `${rect.left + rect.width / 2}px`;
        bubble.style.top = `${rect.top - 20}px`;
        bubble.style.transform = 'translateX(-50%)';
        document.body.appendChild(bubble);

        setTimeout(() => bubble.remove(), 2600);
    }

    setTheme(themeName) {
        this.theme = 'galaxy';
        document.body.setAttribute('data-theme', 'galaxy');
        localStorage.setItem('lx_theme', 'galaxy');
        this.render();
    }

    startTurnTimer(duration = 15, phase = 'WAITING_ROLL') {
        this.stopTurnTimer();
        this.turnDuration = duration;
        this.turnTimeLeft = duration;
        this.turnTimerPhase = phase;
        this.isTurnTimerActive = true;

        this.updateTimerVisuals();

        this.turnTimerId = setInterval(() => {
            if (!this.isTurnTimerActive) return;

            this.turnTimeLeft--;

            // Warning ticking and alert sound effects
            if (this.turnTimeLeft <= 5 && this.turnTimeLeft > 0) {
                if (this.turnTimeLeft <= 3) {
                    window.soundFX.playTimerAlert();
                } else {
                    window.soundFX.playTimerTick();
                }
            }

            this.updateTimerVisuals();

            if (this.turnTimeLeft <= 0) {
                this.handleTurnTimeout();
            }
        }, 1000);
    }

    stopTurnTimer() {
        this.isTurnTimerActive = false;
        if (this.turnTimerId) {
            clearInterval(this.turnTimerId);
            this.turnTimerId = null;
        }
        ['green', 'yellow', 'red', 'blue'].forEach(color => {
            const ring = document.getElementById(`timer_ring_${color}`);
            if (ring) ring.classList.remove('warning', 'critical');
        });
        const chip = document.getElementById('turnTimerChip');
        if (chip) chip.classList.remove('warning', 'critical');
    }

    updateTimerVisuals() {
        const curPlayer = this.engine ? this.engine.getCurrentPlayer() : null;
        if (!curPlayer) return;

        const progress = Math.max(0, Math.min(1, this.turnTimeLeft / this.turnDuration));
        const circumference = 176;
        const offset = circumference * (1 - progress);

        const circle = document.getElementById(`timer_circle_${curPlayer.id}`);
        if (circle) {
            circle.style.strokeDashoffset = offset;
        }

        const badge = document.getElementById(`timer_badge_${curPlayer.id}`);
        if (badge) {
            badge.textContent = Math.max(0, this.turnTimeLeft);
        }

        const ringContainer = document.getElementById(`timer_ring_${curPlayer.id}`);
        const chip = document.getElementById('turnTimerChip');
        const timerSec = document.getElementById('turnTimerSec');

        if (timerSec) {
            timerSec.textContent = `${Math.max(0, this.turnTimeLeft)}s`;
        }

        if (this.turnTimeLeft <= 3) {
            if (ringContainer) {
                ringContainer.classList.add('critical');
                ringContainer.classList.remove('warning');
            }
            if (chip) {
                chip.classList.add('critical');
                chip.classList.remove('warning');
            }
        } else if (this.turnTimeLeft <= 5) {
            if (ringContainer) {
                ringContainer.classList.add('warning');
                ringContainer.classList.remove('critical');
            }
            if (chip) {
                chip.classList.add('warning');
                chip.classList.remove('critical');
            }
        } else {
            if (ringContainer) {
                ringContainer.classList.remove('warning', 'critical');
            }
            if (chip) {
                chip.classList.remove('warning', 'critical');
            }
        }
    }

    handleTurnTimeout() {
        this.stopTurnTimer();
        const curPlayer = this.engine ? this.engine.getCurrentPlayer() : null;
        if (!curPlayer || this.engine.state === 'GAME_OVER') return;

        if (this.turnTimerPhase === 'WAITING_ROLL') {
            this.setBannerText(`⏱️ ${curPlayer.name}-এর সময় শেষ!`, 'স্বয়ংক্রিয়ভাবে চাল দেওয়া হচ্ছে...');
            window.soundFX.playDiceRoll();
            const cornerDiceBox = document.getElementById(`dice_box_${curPlayer.id}`);
            const cornerCube = document.getElementById(`cube_${curPlayer.id}`);
            if (cornerDiceBox) cornerDiceBox.classList.add('rolling');
            if (cornerCube) cornerCube.classList.add('tumble-roll');

            setTimeout(() => {
                if (cornerDiceBox) cornerDiceBox.classList.remove('rolling');
                if (cornerCube) cornerCube.classList.remove('tumble-roll');
                const rollRes = this.engine.rollDice();
                if (!rollRes) return;

                this.updateDiceUI(rollRes.dice);

                if (rollRes.threeSixesCanceled || rollRes.noMoves) {
                    this.stopTurnTimer();
                    this.updatePlayerPods();
                    this.render();
                    setTimeout(() => {
                        this.engine.passTurn();
                        this.updatePlayerPods();
                        this.render();
                        this.checkAITurn();
                    }, 500);
                    return;
                }

                // If valid moves exist, auto-execute the best move
                setTimeout(() => {
                    const bestTokenId = LudoAI.chooseBestMove(this.engine, this.botDifficulty);
                    if (bestTokenId !== null) {
                        this.executeMove(bestTokenId);
                    } else {
                        this.engine.passTurn();
                        this.updatePlayerPods();
                        this.render();
                        this.checkAITurn();
                    }
                }, 150);
            }, 180);
        } else if (this.turnTimerPhase === 'SELECTING_TOKEN') {
            this.setBannerText(`⏱️ ${curPlayer.name}-এর সময় শেষ!`, 'স্বয়ংক্রিয়ভাবে গুটি এগিয়ে দেওয়া হলো');
            const bestTokenId = LudoAI.chooseBestMove(this.engine, this.botDifficulty);
            if (bestTokenId !== null) {
                this.executeMove(bestTokenId);
            } else {
                this.engine.passTurn();
                this.updatePlayerPods();
                this.render();
                this.checkAITurn();
            }
        }
    }

    executeRoll() {
        this.stopTurnTimer();
        window.soundFX.playDiceRoll();
        const curPlayer = this.engine.getCurrentPlayer();
        const cornerDiceBox = document.getElementById(`dice_box_${curPlayer.id}`);
        const cornerCube = document.getElementById(`cube_${curPlayer.id}`);
        if (cornerDiceBox) cornerDiceBox.classList.add('rolling');
        if (cornerCube) cornerCube.classList.add('tumble-roll');

        setTimeout(() => {
            if (cornerDiceBox) cornerDiceBox.classList.remove('rolling');
            if (cornerCube) cornerCube.classList.remove('tumble-roll');
            const result = this.engine.rollDice();
            if (!result) return;

            this.updateDiceUI(result.dice);

            if (result.threeSixesCanceled) {
                this.setBannerText('টানা ৩ বার ৬!', 'চাল বাতিল হয়েছে, পরবর্তী প্লেয়ারের পালা');
                this.updatePlayerPods();
                this.render();
                setTimeout(() => {
                    this.engine.passTurn();
                    this.updatePlayerPods();
                    this.render();
                    this.checkAITurn();
                }, 600);
                return;
            }

            if (result.noMoves) {
                this.setBannerText('কোনো চাল নেই!', 'পরবর্তী প্লেয়ারের টার্ন');
                this.updatePlayerPods();
                this.render();
                setTimeout(() => {
                    this.engine.passTurn();
                    this.updatePlayerPods();
                    this.render();
                    this.checkAITurn();
                }, 600);
                return;
            }

            // If human has exactly 1 valid move, auto move for convenience
            const player = this.engine.getCurrentPlayer();
            if (player.type === 'human' && result.validTokens.length === 1) {
                setTimeout(() => {
                    this.executeMove(result.validTokens[0].token.id);
                }, 120);
            } else {
                this.setBannerText(`${player.name}-এর চাল`, 'গুটি সিলেক্ট করুন');
                this.render();
                // If human player has multiple choices, give a 10s countdown to pick
                if (player.type === 'human') {
                    this.startTurnTimer(10, 'SELECTING_TOKEN');
                }
            }
        }, 220);
    }

    executeMove(tokenId) {
        if (this.animatingTokens) return;
        this.stopTurnTimer();

        const path = this.engine.calculateTokenPath(tokenId);
        const player = this.engine.getCurrentPlayer();
        const token = player.tokens.find(t => t.id === tokenId);

        if (!path || path.length === 0 || !token) {
            this.finalizeMove(tokenId);
            return;
        }

        this.animatingTokens = true;
        let stepIdx = 0;

        const animateStep = () => {
            if (stepIdx < path.length) {
                const nextStep = path[stepIdx];
                token.state = nextStep.state;
                token.stepCount = nextStep.stepCount;
                token.trackIndex = nextStep.trackIndex;

                window.soundFX.playStepTick();
                this.render(token.id); // pass jumping token id for hop elevation

                stepIdx++;
                setTimeout(animateStep, 180);
            } else {
                this.animatingTokens = false;
                this.finalizeMove(tokenId);
            }
        };

        animateStep();
    }

    finalizeMove(tokenId) {
        this.stopTurnTimer();
        const moveRes = this.engine.moveToken(tokenId);
        if (!moveRes) return;

        window.soundFX.playMove();

        if (moveRes.cutOccurred) {
            window.soundFX.playCut();
            this.showCaptureFX();
            this.setBannerText('💥 প্রতিপক্ষের গুটি কাটা হয়েছে!', '+১ অতিরিক্ত বোনাস চাল!');
        } else if (moveRes.tokenFinished) {
            window.soundFX.playSafe();
            this.showHomeReachFX();
            this.setBannerText('🎯 গুটি সেন্টারে পৌঁছেছে!', '+১ অতিরিক্ত বোনাস চাল!');
        } else if (moveRes.bonusTurn) {
            this.setBannerText('🎲 ছক্কা পড়েছে!', '+১ অতিরিক্ত বোনাস চাল!');
        }

        this.updatePlayerPods();
        this.render();

        if (moveRes.gameOver) {
            this.showVictory(moveRes.winners);
            return;
        }

        this.checkAITurn();
    }

    checkAITurn() {
        if (this.engine.state === 'GAME_OVER') {
            this.stopTurnTimer();
            return;
        }

        // Always sync all corner player pods immediately to the active player
        this.updatePlayerPods();
        this.render();

        const player = this.engine.getCurrentPlayer();

        // Always activate live 15-second Turn Timer
        this.startTurnTimer(15, 'WAITING_ROLL');

        if (player.type === 'ai' || this.autoPlay) {
            document.getElementById('btnRoll').disabled = true;
            this.setBannerText(`${player.name} (${this.autoPlay ? 'অটো-প্লে' : 'রোবট'})...`, 'ডাইস রোল হচ্ছে');

            setTimeout(() => {
                if (!this.isTurnTimerActive) return;
                window.soundFX.playDiceRoll();
                const cornerDiceBox = document.getElementById(`dice_box_${player.id}`);
                const cornerCube = document.getElementById(`cube_${player.id}`);
                if (cornerDiceBox) cornerDiceBox.classList.add('rolling');
                if (cornerCube) cornerCube.classList.add('tumble-roll');

                setTimeout(() => {
                    if (cornerDiceBox) cornerDiceBox.classList.remove('rolling');
                    if (cornerCube) cornerCube.classList.remove('tumble-roll');
                    const rollRes = this.engine.rollDice();
                    if (!rollRes) return;

                    this.updateDiceUI(rollRes.dice);

                    if (rollRes.threeSixesCanceled || rollRes.noMoves) {
                        this.stopTurnTimer();
                        this.updatePlayerPods();
                        this.render();
                        setTimeout(() => {
                            this.engine.passTurn();
                            this.updatePlayerPods();
                            this.render();
                            this.checkAITurn();
                        }, 800);
                        return;
                    }

                    // AI / Auto selects best move (800ms pause so player sees the rolled dice clearly)
                    setTimeout(() => {
                        const bestTokenId = LudoAI.chooseBestMove(this.engine, this.botDifficulty);
                        if (bestTokenId !== null) {
                            this.executeMove(bestTokenId);
                        } else {
                            this.stopTurnTimer();
                            this.engine.passTurn();
                            this.updatePlayerPods();
                            this.render();
                            this.checkAITurn();
                        }
                    }, 800);
                }, 500);
            }, 700);
        } else {
            // Human turn (Manual)
            document.getElementById('btnRoll').disabled = (this.engine.state !== 'WAITING_ROLL');
            this.setBannerText(`${player.name}-এর টার্ন`, 'ডাইস রোল করুন');
        }
    }

    handleCanvasClick(e) {
        const player = this.engine.getCurrentPlayer();
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // 1. Check if user clicked on their personal Yard Dice to Roll
        if (player.type === 'human' && this.engine.state === 'WAITING_ROLL') {
            const pData = BOARD_DATA.PLAYERS[player.id.toUpperCase()];
            if (pData && pData.diceCenter) {
                const dcx = (pData.diceCenter.col + 0.5) * this.cellSize;
                const dcy = (pData.diceCenter.row + 0.5) * this.cellSize;
                const distToDice = Math.hypot(clickX - dcx, clickY - dcy);
                if (distToDice <= this.cellSize * 1.2) {
                    this.executeRoll();
                    return;
                }
            }
        }

        if (player.type !== 'human' || this.engine.state !== 'SELECTING_TOKEN') return;

        // 2. Find which valid token was clicked with generous touch/click hit-box
        let selectedToken = null;
        let minDist = Infinity;

        for (let move of this.engine.validMoves) {
            const token = move.token;
            const pos = this.getTokenPixelPos(token);
            const dist = Math.hypot(clickX - pos.x, clickY - pos.y);

            // Generous hit-box (0.9 * cellSize) for easy clicking on mobile or PC
            if (dist <= this.cellSize * 0.95 && dist < minDist) {
                minDist = dist;
                selectedToken = token;
            }
        }

        if (selectedToken) {
            this.executeMove(selectedToken.id);
        }
    }

    getTokenPixelPos(token, jumpingTokenId = null) {
        const pData = BOARD_DATA.PLAYERS[token.color.toUpperCase()];
        let base = { x: 0, y: 0 };

        if (token.state === 'YARD') {
            const coord = pData.yardCoords[token.id];
            base = BOARD_DATA.gridToPixels(coord.col, coord.row, this.boardSize);
            return { x: base.x, y: base.y, scale: 1.0 };
        } else if (token.state === 'TRACK') {
            const coord = BOARD_DATA.TRACK[token.trackIndex];
            base = BOARD_DATA.gridToPixels(coord.col, coord.row, this.boardSize);
        } else if (token.state === 'HOME_STRETCH') {
            const stretchIdx = token.stepCount - 51; // 0..4
            const coord = pData.homeStretch[stretchIdx];
            base = BOARD_DATA.gridToPixels(coord.col, coord.row, this.boardSize);
        } else {
            // FINISHED
            base = BOARD_DATA.gridToPixels(pData.centerGoal.col, pData.centerGoal.row, this.boardSize);
        }

        // Stacking calculation: Find all tokens sharing this exact location
        const group = [];
        this.engine.players.forEach(p => {
            p.tokens.forEach(t => {
                if (t.state === token.state) {
                    if (token.state === 'TRACK' && t.trackIndex === token.trackIndex) {
                        group.push(t);
                    } else if (token.state === 'HOME_STRETCH' && t.color === token.color && t.stepCount === token.stepCount) {
                        group.push(t);
                    }
                }
            });
        });

        let offsetX = 0;
        let offsetY = 0;
        let scale = 1.0;

        if (group.length === 2) {
            scale = 0.82;
            const idx = group.findIndex(t => t.id === token.id && t.color === token.color);
            offsetX = (idx === 0 ? -1 : 1) * this.cellSize * 0.18;
            offsetY = (idx === 0 ? -1 : 1) * this.cellSize * 0.08;
        } else if (group.length === 3) {
            scale = 0.74;
            const idx = group.findIndex(t => t.id === token.id && t.color === token.color);
            if (idx === 0) { offsetX = 0; offsetY = -this.cellSize * 0.18; }
            else if (idx === 1) { offsetX = -this.cellSize * 0.18; offsetY = this.cellSize * 0.12; }
            else { offsetX = this.cellSize * 0.18; offsetY = this.cellSize * 0.12; }
        } else if (group.length >= 4) {
            scale = 0.66;
            const idx = group.findIndex(t => t.id === token.id && t.color === token.color);
            const col = (idx % 2 === 0 ? -1 : 1);
            const row = (idx < 2 ? -1 : 1);
            offsetX = col * this.cellSize * 0.18;
            offsetY = row * this.cellSize * 0.18;
        }

        // Hopping bounce elevation
        if (jumpingTokenId !== null && token.id === jumpingTokenId && token.color === this.engine.getCurrentPlayer().id) {
            offsetY -= this.cellSize * 0.28;
        }

        return {
            x: base.x + offsetX,
            y: base.y + offsetY,
            scale: scale
        };
    }

    updateDiceUI(val) {
        const curPlayer = this.engine.getCurrentPlayer();
        if (!curPlayer) return;

        // 1. Update 3D Cube Rotation to display exact face (1 to 6)
        const cube = document.getElementById(`cube_${curPlayer.id}`);
        if (cube) {
            cube.classList.remove('tumble-roll');
            cube.className = `dice-3d-cube show-${val}`;
        }


        // 3. Fallback update for 2D dice face
        const faceEl = document.getElementById(`dice_face_${curPlayer.id}`);
        if (faceEl) {
            faceEl.className = `dice-face val-${val}`;
            // Ensure 9 pips exist
            if (faceEl.children.length < 9) {
                faceEl.innerHTML = `
                    <div class="pip p1"></div><div class="pip p2"></div><div class="pip p3"></div>
                    <div class="pip p4"></div><div class="pip p5"></div><div class="pip p6"></div>
                    <div class="pip p7"></div><div class="pip p8"></div><div class="pip p9"></div>
                `;
            }
        }

        // 4. Subtle mobile haptic feedback
        this.triggerHaptic([35]);
    }

    updatePlayerPods() {
        const curPlayer = this.engine ? this.engine.getCurrentPlayer() : null;
        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const pod = document.getElementById(`corner_${color}`);
            const diceBox = document.getElementById(`dice_box_${color}`);
            const faceEl = document.getElementById(`dice_face_${color}`);
            const statEl = document.getElementById(`stat_${color}`);

            if (!pod) return;

            const pObj = this.engine ? this.engine.players.find(p => p.id === color) : null;
            if (!pObj) {
                pod.style.opacity = '0.25';
                pod.classList.remove('active-turn');
                if (diceBox) diceBox.style.display = 'none';
                return;
            }

            pod.style.opacity = '1';
            const nameEl = pod.querySelector('.p-name');
            if (nameEl) {
                if (this.engine.mode === 'TEAM_2V2') {
                    nameEl.textContent = (color === 'blue' || color === 'green') ? 'Team A' : 'Team B';
                } else if (pObj.name) {
                    nameEl.textContent = pObj.name;
                }
            }

            const isActive = (curPlayer && curPlayer.id === color);

            if (isActive) {
                pod.classList.add('active-turn');
                if (diceBox) {
                    diceBox.style.display = 'flex';
                }
            } else {
                pod.classList.remove('active-turn');
            }

            // Ensure pips are rendered inside corner dice box
            if (faceEl && faceEl.children.length < 9) {
                faceEl.innerHTML = `
                    <div class="pip p1"></div><div class="pip p2"></div><div class="pip p3"></div>
                    <div class="pip p4"></div><div class="pip p5"></div><div class="pip p6"></div>
                    <div class="pip p7"></div><div class="pip p8"></div><div class="pip p9"></div>
                `;
                faceEl.className = 'dice-face val-6';
            }

            const total = (this.engine.mode === 'QUICK_RUSH') ? 2 : 4;
            if (statEl) {
                statEl.textContent = `পাকা: ${pObj.finishedTokens}/${total}`;
            }
        });

        // Dynamic player color on main roll button
        const btnRoll = document.getElementById('btnRoll');
        if (btnRoll && curPlayer) {
            btnRoll.className = `btn-roll ${curPlayer.id}`;
        }

        this.updatePowerUpsUI();
    }

    updatePowerUpsUI() {
        const curPlayer = this.engine.getCurrentPlayer();
        const pUp = this.engine.powerUps[curPlayer.id];
        const isPowerMode = (this.engine.mode === 'POWER_DICE');
        const container = document.getElementById('powerupsBar');

        if (!isPowerMode) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        document.getElementById('shieldCount').textContent = pUp ? pUp.shield : 0;
        document.getElementById('rerollCount').textContent = pUp ? pUp.reroll : 0;
        document.getElementById('jumpCount').textContent = pUp ? pUp.jump : 0;
    }

    setBannerText(main, sub) {
        const mainEl = document.getElementById('turnMainText');
        const subEl = document.getElementById('turnSubText');
        if (mainEl) mainEl.textContent = main;
        if (subEl) subEl.textContent = sub;
    }

    throwEmoji(emojiChar) {
        window.soundFX.playEmojiSplat();
        const el = document.createElement('div');
        el.className = 'flying-emoji';
        el.textContent = emojiChar;
        document.body.appendChild(el);

        const startX = window.innerWidth / 2;
        const startY = window.innerHeight - 80;
        el.style.left = `${startX}px`;
        el.style.top = `${startY}px`;

        const targetX = startX + (Math.random() - 0.5) * 300;
        const targetY = window.innerHeight / 2 + (Math.random() - 0.5) * 200;

        setTimeout(() => {
            el.style.left = `${targetX}px`;
            el.style.top = `${targetY}px`;
            el.style.transform = `scale(1.6) rotate(${Math.random() * 60 - 30}deg)`;
        }, 20);

        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 400);
        }, 1200);
    }

    showVictory(winners) {
        this.stopTurnTimer();
        window.soundFX.playVictory();
        const modal = document.getElementById('modalVictory');
        let winnerName = '';
        if (this.engine.mode === 'TEAM_2V2' && this.engine.winningTeam) {
            winnerName = (this.engine.winningTeam === 'A') ? 'দল A (ব্লু ও গ্রিন)' : 'দল B (রেড ও ইয়েলো)';
        } else {
            const p = BOARD_DATA.PLAYERS[winners[0]?.toUpperCase()];
            winnerName = p ? p.name : (winners[0] || 'প্লেয়ার');
        }
        document.getElementById('victoryText').textContent = `🎉 অভিনন্দন! ${winnerName} জয়লাভ করেছে!`;
        modal.classList.add('active');
        this.launchConfetti();
    }

    launchConfetti() {
        const cCanvas = document.getElementById('confettiCanvas');
        const cCtx = cCanvas.getContext('2d');
        cCanvas.width = window.innerWidth;
        cCanvas.height = window.innerHeight;

        const particles = [];
        const colors = ['#ff3366', '#00e676', '#ffea00', '#00b0ff', '#ffffff'];

        for (let i = 0; i < 80; i++) {
            particles.push({
                x: Math.random() * cCanvas.width,
                y: Math.random() * cCanvas.height * 0.5,
                r: Math.random() * 6 + 3,
                c: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 3 + 2
            });
        }

        let animFrame;
        const updateConfetti = () => {
            cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                cCtx.beginPath();
                cCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                cCtx.fillStyle = p.c;
                cCtx.fill();
            });
            animFrame = requestAnimationFrame(updateConfetti);
        };
        updateConfetti();
        setTimeout(() => {
            cancelAnimationFrame(animFrame);
            cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
        }, 3500);
    }

    // ==========================================
    // CANVAS RENDERING ENGINE
    // ==========================================
    render(jumpingTokenId = null) {
        const ctx = this.ctx;
        const size = this.boardSize;
        const cell = this.cellSize;

        ctx.clearRect(0, 0, size, size);

        // 1. Board Background: Pure crisp white for all tracks & movement cells
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // 2. Draw 4 Yards (Bases)
        this.drawYard(0, 9, BOARD_DATA.PLAYERS.RED);       // Bottom-Left (Red)
        this.drawYard(0, 0, BOARD_DATA.PLAYERS.GREEN);     // Top-Left (Green)
        this.drawYard(9, 0, BOARD_DATA.PLAYERS.YELLOW);    // Top-Right (Yellow)
        this.drawYard(9, 9, BOARD_DATA.PLAYERS.BLUE);      // Bottom-Right (Blue)

        // 3. Draw Track Grid (Common 52 Tracks)
        BOARD_DATA.TRACK.forEach((coord, idx) => {
            this.drawTrackCell(coord.col, coord.row, idx);
        });

        // 4. Draw 4 Home Stretches
        this.drawHomeStretch(BOARD_DATA.PLAYERS.RED);
        this.drawHomeStretch(BOARD_DATA.PLAYERS.GREEN);
        this.drawHomeStretch(BOARD_DATA.PLAYERS.YELLOW);
        this.drawHomeStretch(BOARD_DATA.PLAYERS.BLUE);

        // 5. Draw Center Goal Triangles
        this.drawCenterGoal();

        // 6. Draw Tokens
        this.drawTokens(jumpingTokenId);
    }

    drawYard(startCol, startRow, pData) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = startCol * cell;
        const y = startRow * cell;
        const w = 6 * cell;
        const h = 6 * cell;

        // 1. Outer 3D Beveled Base Tray with metallic/gradient lighting
        const trayGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        trayGrad.addColorStop(0, '#ffffff');
        trayGrad.addColorStop(0.12, pData.colorHex);
        trayGrad.addColorStop(0.85, pData.colorHex);
        trayGrad.addColorStop(1, 'rgba(0,0,0,0.4)');

        ctx.fillStyle = trayGrad;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 16);
        ctx.fill();

        // 2. Inner base: Crisp ivory/white playing well with inner bevel
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x + cell, y + cell, 4 * cell, 4 * cell, 12);
        ctx.fill();

        // Subtle inner rim stroke
        ctx.strokeStyle = pData.colorHex;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 3. 4 Sunken 3D Circular Token Sockets inside Yard (Matching Reference Image)
        pData.yardCoords.forEach(pos => {
            const px = (pos.col + 0.5) * cell;
            const py = (pos.row + 0.5) * cell;
            const cupR = cell * 0.44;

            // Recessed socket outer well shadow
            ctx.beginPath();
            ctx.arc(px, py, cupR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
            ctx.fill();

            // Sunken socket rim
            ctx.beginPath();
            ctx.arc(px, py, cupR - 1, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
            ctx.strokeStyle = 'rgba(203, 213, 225, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Inner colored socket well with 3D radial depth
            const innerGrad = ctx.createRadialGradient(
                px - cupR * 0.25, py - cupR * 0.25, cupR * 0.08,
                px, py, cupR * 0.36
            );
            innerGrad.addColorStop(0, '#ffffff');
            innerGrad.addColorStop(0.35, pData.colorHex);
            innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');

            ctx.beginPath();
            ctx.arc(px, py, cupR * 0.36, 0, Math.PI * 2);
            ctx.fillStyle = innerGrad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    drawDicePips(ctx, dx, dy, size, val, pipColor) {
        ctx.fillStyle = pipColor || '#222222';
        const r = size * 0.085;
        const p1 = size * 0.25;
        const p2 = size * 0.5;
        const p3 = size * 0.75;

        const pipMap = {
            1: [{x: p2, y: p2}],
            2: [{x: p1, y: p1}, {x: p3, y: p3}],
            3: [{x: p1, y: p1}, {x: p2, y: p2}, {x: p3, y: p3}],
            4: [{x: p1, y: p1}, {x: p3, y: p1}, {x: p1, y: p3}, {x: p3, y: p3}],
            5: [{x: p1, y: p1}, {x: p3, y: p1}, {x: p2, y: p2}, {x: p1, y: p3}, {x: p3, y: p3}],
            6: [{x: p1, y: p1}, {x: p3, y: p1}, {x: p1, y: p2}, {x: p3, y: p2}, {x: p1, y: p3}, {x: p3, y: p3}]
        };

        const dots = pipMap[val] || pipMap[6];
        dots.forEach(d => {
            ctx.beginPath();
            ctx.arc(dx + d.x, dy + d.y, r, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawTrackCell(col, row, trackIdx) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = col * cell;
        const y = row * cell;

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, y, cell, cell);

        // Highlight player start cells
        let fillColor = null;
        if (trackIdx === 0) fillColor = BOARD_DATA.PLAYERS.RED.colorHex;
        else if (trackIdx === 13) fillColor = BOARD_DATA.PLAYERS.GREEN.colorHex;
        else if (trackIdx === 26) fillColor = BOARD_DATA.PLAYERS.YELLOW.colorHex;
        else if (trackIdx === 39) fillColor = BOARD_DATA.PLAYERS.BLUE.colorHex;

        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.globalAlpha = 0.45;
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            ctx.globalAlpha = 1.0;
        }

        // Draw Safe Star
        if (BOARD_DATA.isSafeIndex(trackIdx)) {
            this.drawStar(x + cell / 2, y + cell / 2, cell * 0.34, 5, cell * 0.17);
        }
    }

    drawHomeStretch(pData) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        pData.homeStretch.forEach(coord => {
            const x = coord.col * cell;
            const y = coord.row * cell;
            ctx.fillStyle = pData.colorHex;
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, cell, cell);
        });
    }

    drawCenterGoal() {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const cx = 7.5 * cell;
        const cy = 7.5 * cell;

        const drawTri = (pData, x1, y1, x2, y2) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x1 * cell, y1 * cell);
            ctx.lineTo(x2 * cell, y2 * cell);
            ctx.closePath();
            ctx.fillStyle = pData.colorHex;
            ctx.fill();
        };

        drawTri(BOARD_DATA.PLAYERS.GREEN, 6, 6, 6, 9);   // Left
        drawTri(BOARD_DATA.PLAYERS.YELLOW, 6, 6, 9, 6);  // Top
        drawTri(BOARD_DATA.PLAYERS.BLUE, 9, 6, 9, 9);    // Right
        drawTri(BOARD_DATA.PLAYERS.RED, 6, 9, 9, 9);     // Bottom
    }

    drawStar(cx, cy, outerRadius, points, innerRadius) {
        const ctx = this.ctx;
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / points;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < points; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fillStyle = (this.theme === 'neon' || this.theme === 'esports') ? '#00e5ff' : '#f5b041';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    drawTokens(jumpingTokenId = null) {
        const ctx = this.ctx;
        const cell = this.cellSize;

        this.engine.players.forEach(player => {
            player.tokens.forEach(token => {
                if (token.state === 'FINISHED') return;

                const pos = this.getTokenPixelPos(token, jumpingTokenId);
                const scale = pos.scale || 1.0;
                const isValidMove = this.engine.validMoves.some(m => m.token.id === token.id && player.id === this.engine.getCurrentPlayer().id);

                // Highlight clickable tokens with glowing pulsating ring
                if (isValidMove && !this.animatingTokens) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, cell * 0.48 * scale, 0, Math.PI * 2);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = player.colorHex;
                    ctx.shadowBlur = 15;
                    ctx.stroke();
                    ctx.restore();
                }

                // Shield Halo (in Power Dice Mode)
                if (token.hasShield) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, cell * 0.52 * scale, 0, Math.PI * 2);
                    ctx.strokeStyle = '#00d4ff';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#00d4ff';
                    ctx.shadowBlur = 10;
                    ctx.stroke();
                    ctx.restore();
                }

                // =======================================================
                // Authentic AAA 3D Glossy Pawn with Dynamic Hop Depth
                // =======================================================
                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.scale(scale, scale);

                const isJumping = (jumpingTokenId !== null && token.id === jumpingTokenId && player.id === this.engine.getCurrentPlayer().id);

                // 1. Dynamic Contact Shadow (Stays grounded during hop)
                ctx.beginPath();
                if (isJumping) {
                    ctx.ellipse(0, cell * 0.28 + cell * 0.26, cell * 0.32, cell * 0.16, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
                } else {
                    ctx.ellipse(0, cell * 0.28, cell * 0.26, cell * 0.12, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
                }
                ctx.fill();

                // 2. Base Pedestal (Pawn Skirt)
                ctx.beginPath();
                ctx.ellipse(0, cell * 0.16, cell * 0.26, cell * 0.14, 0, 0, Math.PI * 2);
                ctx.fillStyle = player.colorHex;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.6;
                ctx.stroke();

                // 3. Pawn Stem / Body (Tapered with metallic sheen)
                ctx.beginPath();
                ctx.moveTo(-cell * 0.16, cell * 0.12);
                ctx.quadraticCurveTo(-cell * 0.08, -cell * 0.05, -cell * 0.12, -cell * 0.15);
                ctx.lineTo(cell * 0.12, -cell * 0.15);
                ctx.quadraticCurveTo(cell * 0.08, -cell * 0.05, cell * 0.16, cell * 0.12);
                ctx.closePath();
                ctx.fillStyle = player.colorHex;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // 4. Pawn Collar Ring (Golden Trim with highlight)
                ctx.beginPath();
                ctx.ellipse(0, -cell * 0.15, cell * 0.14, cell * 0.06, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#f59e0b';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();

                // 5. Pawn Top Sphere (Glossy Head Bulb)
                const headRadius = cell * 0.20;
                const headY = -cell * 0.28;

                // Radial 3D Gradient for sphere
                const grad = ctx.createRadialGradient(
                    -headRadius * 0.35, headY - headRadius * 0.35, headRadius * 0.1,
                    0, headY, headRadius
                );
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.35, player.colorHex);
                grad.addColorStop(1, '#000000');

                ctx.beginPath();
                ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // 6. Specular Porcelain Gloss Arc on Top Bulb
                ctx.beginPath();
                ctx.ellipse(-headRadius * 0.32, headY - headRadius * 0.32, headRadius * 0.36, headRadius * 0.16, -Math.PI / 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                ctx.fill();

                ctx.restore();
            });
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.ludoApp = new LudoUIController();
});
