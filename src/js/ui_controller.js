// Ludo X UI Controller & High-DPI Canvas Board Renderer

class LudoUIController {
    constructor() {
        window.uiController = this;
        window.ludoApp = this;
        this.canvas = document.getElementById('ludoCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.engine = new LudoGameEngine();
        this.theme = 'galaxy';
        localStorage.setItem('lx_theme', 'galaxy');
        this.boardTheme = localStorage.getItem('lx_board_theme') || 'white';
        this.animatingTokens = false;
        this.boardCacheValid = false;
        this.boardCacheCanvas = document.createElement('canvas');

        this.autoPlay = false;
        this.turnDuration = 15;
        this.turnTimeLeft = 15;
        this.turnTimerId = null;
        this.isTurnTimerActive = false;
        this.turnTimerPhase = 'WAITING_ROLL';
        this.botDifficulty = 'medium';
        this.lastGameConfig = null;

        this.initUserStats();
        this.initInventory();
        this.applyAvatar(this.userStats.avatar);
        this.initCanvasSize();
        this.bindEvents();
        this.setTheme(this.theme);
        this.setBoardTheme(this.boardTheme);
        this.updatePlayerPods();
        this.applyEquippedSkins();
        this.render();
        if (window.networkManager) {
            window.networkManager.updateActiveMatchUI();
        }
    }

    initUserStats() {
        this.userStats = {
            name: localStorage.getItem('lx_player_name') || 'Pro Player BD',
            avatar: localStorage.getItem('lx_avatar') || 'king',
            coins: parseInt(localStorage.getItem('lx_coins') || '5050', 10),
            diamonds: parseInt(localStorage.getItem('lx_diamonds') || '50', 10),
            level: parseInt(localStorage.getItem('lx_level') || '1', 10),
            matchesPlayed: parseInt(localStorage.getItem('lx_matches') || '0', 10),
            matchesWon: parseInt(localStorage.getItem('lx_won') || '0', 10),
            matchesLost: parseInt(localStorage.getItem('lx_lost') || '0', 10),
            currentStreak: parseInt(localStorage.getItem('lx_current_streak') || '0', 10),
            highestStreak: parseInt(localStorage.getItem('lx_highest_streak') || '0', 10)
        };
        this.updateWalletUI();
    }

    initInventory() {
        this.diceSkins = [
            { id: 'classic', nameEn: 'Classic Ivory', nameBn: 'ক্লাসিক আইভরি', price: 0, desc: 'প্রিমিয়াম হাতির দাঁত ফিনিশ' },
            { id: 'gold', nameEn: 'Royal Golden', nameBn: 'রয়্যাল গোল্ডেন', price: 5000, desc: '২৪ ক্যারেট খাঁটি গোল্ডেন শাইন' },
            { id: 'neon', nameEn: 'Neon Cyber', nameBn: 'সাইবার নিয়ন', price: 10000, desc: 'আল্ট্রা গ্লোয়িং সাইবার সাই-ফাই' },
            { id: 'ruby', nameEn: 'Ruby Premium', nameBn: 'রুবি প্রিমিয়াম', price: 20000, desc: 'দীপ্তিময় রাজকীয় ক্রিস্টাল রুবি' }
        ];

        this.tokenSkins = [
            { id: 'classic', nameEn: 'Classic Chrome', nameBn: 'ক্লাসিক ক্রোম', price: 0, desc: 'হাই-গ্লস ক্রোম ও নিয়ন কোর' },
            { id: 'gold', nameEn: 'Royal Gold', nameBn: 'রয়্যাল গোল্ড', price: 5000, desc: 'খাঁটি স্বর্ণালী ক্রাউন ও গ্লো' },
            { id: 'crystal', nameEn: 'Crystal Ice', nameBn: 'আইসি ক্রিস্টাল', price: 10000, desc: 'হীরার মতো ঝলমলে প্রিজম' },
            { id: 'neon', nameEn: 'Cyber Neon', nameBn: 'সাইবার নিয়ন', price: 20000, desc: 'হাই-ভোল্টেজ প্লাজমা এনার্জি' }
        ];

        this.inventory = {
            diceSkins: ['classic'],
            tokenSkins: ['classic'],
            equippedDice: 'classic',
            equippedToken: 'classic'
        };

        try {
            const savedDice = JSON.parse(localStorage.getItem('lx_owned_dice') || '["classic"]');
            if (Array.isArray(savedDice) && savedDice.length > 0) {
                this.inventory.diceSkins = savedDice;
            }
        } catch (e) {
            this.inventory.diceSkins = ['classic'];
        }
        if (!this.inventory.diceSkins.includes('classic')) this.inventory.diceSkins.unshift('classic');

        try {
            const savedTokens = JSON.parse(localStorage.getItem('lx_owned_tokens') || '["classic"]');
            if (Array.isArray(savedTokens) && savedTokens.length > 0) {
                this.inventory.tokenSkins = savedTokens;
            }
        } catch (e) {
            this.inventory.tokenSkins = ['classic'];
        }
        if (!this.inventory.tokenSkins.includes('classic')) this.inventory.tokenSkins.unshift('classic');

        this.inventory.equippedDice = localStorage.getItem('lx_equipped_dice') || 'classic';
        if (!this.inventory.diceSkins.includes(this.inventory.equippedDice)) {
            this.inventory.equippedDice = 'classic';
        }

        this.inventory.equippedToken = localStorage.getItem('lx_equipped_token') || 'classic';
        if (!this.inventory.tokenSkins.includes(this.inventory.equippedToken)) {
            this.inventory.equippedToken = 'classic';
        }

        // Segmented tabs switcher
        const tabDice = document.getElementById('tabDiceSkins');
        const tabToken = document.getElementById('tabTokenSkins');
        const panelDice = document.getElementById('invDiceCategory');
        const panelToken = document.getElementById('invTokenCategory');

        if (tabDice && tabToken && panelDice && panelToken) {
            tabDice.addEventListener('click', () => {
                window.soundFX.playClick();
                tabDice.classList.add('active');
                tabToken.classList.remove('active');
                panelDice.style.display = 'block';
                panelToken.style.display = 'none';
            });

            tabToken.addEventListener('click', () => {
                window.soundFX.playClick();
                tabToken.classList.add('active');
                tabDice.classList.remove('active');
                panelDice.style.display = 'none';
                panelToken.style.display = 'block';
                this.renderTokenPreviewCanvases();
            });
        }

        this.updateInventoryUI();
    }

    applyEquippedSkins() {
        const diceSkin = this.inventory?.equippedDice || 'classic';
        const skinClasses = ['dice-skin-classic', 'dice-skin-gold', 'dice-skin-neon', 'dice-skin-ruby'];

        // Apply to all 3D cubes
        const allCubes = document.querySelectorAll('.dice-3d-cube');
        allCubes.forEach(cube => {
            if (cube.closest('.preview-scene')) return; // keep preview scenes to their own skin
            cube.classList.remove(...skinClasses);
            cube.classList.add(`dice-skin-${diceSkin}`);
        });

        // Apply to game container and corner dice boxes so CSS descendant selectors always match
        const gameContainer = document.querySelector('.game-container') || document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.classList.remove(...skinClasses);
            gameContainer.classList.add(`dice-skin-${diceSkin}`);
        }

        const diceBoxes = document.querySelectorAll('.personal-dice-box');
        diceBoxes.forEach(box => {
            box.classList.remove(...skinClasses);
            box.classList.add(`dice-skin-${diceSkin}`);
        });
    }

    updateInventoryUI() {
        const invCoinsEl = document.getElementById('invUserCoins');
        if (invCoinsEl) invCoinsEl.textContent = this.userStats.coins.toLocaleString();

        const diceGrid = document.getElementById('diceSkinsGrid');
        if (diceGrid) {
            let diceHTML = '';
            this.diceSkins.forEach(skin => {
                const isOwned = this.inventory.diceSkins.includes(skin.id);
                const isEquipped = this.inventory.equippedDice === skin.id;

                let actionBtnHTML = '';
                if (isEquipped) {
                    actionBtnHTML = `<button class="btn-skin-action btn-equipped" disabled>✔ চালু আছে</button>`;
                } else if (isOwned) {
                    actionBtnHTML = `<button class="btn-skin-action btn-equip" data-equip-dice="${skin.id}">সক্রিয় করুন</button>`;
                } else {
                    actionBtnHTML = `<button class="btn-skin-action btn-buy" data-buy-dice="${skin.id}">🪙 ${skin.price.toLocaleString()} কিনুন</button>`;
                }

                const priceTagHTML = skin.price === 0 
                    ? `<span class="skin-price-tag free">বিনামূল্যে (Free)</span>`
                    : `<span class="skin-price-tag">🪙 ${skin.price.toLocaleString()}</span>`;

                diceHTML += `
                    <div class="skin-card ${isEquipped ? 'is-equipped' : ''}">
                        <div class="skin-preview-wrap">
                            <div class="dice-3d-scene preview-scene">
                                <div class="dice-3d-cube show-1 dice-skin-${skin.id}">
                                    <div class="dice-3d-face face-1"><div class="pip p5"></div></div>
                                    <div class="dice-3d-face face-2"><div class="pip p1"></div><div class="pip p9"></div></div>
                                    <div class="dice-3d-face face-3"><div class="pip p1"></div><div class="pip p5"></div><div class="pip p9"></div></div>
                                    <div class="dice-3d-face face-4"><div class="pip p1"></div><div class="pip p3"></div><div class="pip p7"></div><div class="pip p9"></div></div>
                                    <div class="dice-3d-face face-5"><div class="pip p1"></div><div class="pip p3"></div><div class="pip p5"></div><div class="pip p7"></div><div class="pip p9"></div></div>
                                    <div class="dice-3d-face face-6"><div class="pip p1"></div><div class="pip p3"></div><div class="pip p4"></div><div class="pip p6"></div><div class="pip p7"></div><div class="pip p9"></div></div>
                                </div>
                            </div>
                        </div>
                        <div class="skin-name-row">
                            <span class="skin-name-en">${skin.nameEn}</span>
                            <span class="skin-name-bn">${skin.nameBn}</span>
                        </div>
                        <div class="skin-desc">${skin.desc}</div>
                        ${priceTagHTML}
                        ${actionBtnHTML}
                    </div>
                `;
            });
            diceGrid.innerHTML = diceHTML;

            diceGrid.querySelectorAll('[data-buy-dice]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const skinId = e.currentTarget.dataset.buyDice;
                    this.buySkin('dice', skinId);
                });
            });
            diceGrid.querySelectorAll('[data-equip-dice]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const skinId = e.currentTarget.dataset.equipDice;
                    this.equipSkin('dice', skinId);
                });
            });
        }

        const tokenGrid = document.getElementById('tokenSkinsGrid');
        if (tokenGrid) {
            let tokenHTML = '';
            this.tokenSkins.forEach(skin => {
                const isOwned = this.inventory.tokenSkins.includes(skin.id);
                const isEquipped = this.inventory.equippedToken === skin.id;

                let actionBtnHTML = '';
                if (isEquipped) {
                    actionBtnHTML = `<button class="btn-skin-action btn-equipped" disabled>✔ চালু আছে</button>`;
                } else if (isOwned) {
                    actionBtnHTML = `<button class="btn-skin-action btn-equip" data-equip-token="${skin.id}">সক্রিয় করুন</button>`;
                } else {
                    actionBtnHTML = `<button class="btn-skin-action btn-buy" data-buy-token="${skin.id}">🪙 ${skin.price.toLocaleString()} কিনুন</button>`;
                }

                const priceTagHTML = skin.price === 0 
                    ? `<span class="skin-price-tag free">বিনামূল্যে (Free)</span>`
                    : `<span class="skin-price-tag">🪙 ${skin.price.toLocaleString()}</span>`;

                tokenHTML += `
                    <div class="skin-card ${isEquipped ? 'is-equipped' : ''}">
                        <div class="skin-preview-wrap">
                            <canvas class="token-skin-canvas" width="60" height="60" data-token-skin="${skin.id}"></canvas>
                        </div>
                        <div class="skin-name-row">
                            <span class="skin-name-en">${skin.nameEn}</span>
                            <span class="skin-name-bn">${skin.nameBn}</span>
                        </div>
                        <div class="skin-desc">${skin.desc}</div>
                        ${priceTagHTML}
                        ${actionBtnHTML}
                    </div>
                `;
            });
            tokenGrid.innerHTML = tokenHTML;

            tokenGrid.querySelectorAll('[data-buy-token]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const skinId = e.currentTarget.dataset.buyToken;
                    this.buySkin('token', skinId);
                });
            });
            tokenGrid.querySelectorAll('[data-equip-token]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const skinId = e.currentTarget.dataset.equipToken;
                    this.equipSkin('token', skinId);
                });
            });

            this.renderTokenPreviewCanvases();
        }
    }

    renderTokenPreviewCanvases() {
        const canvases = document.querySelectorAll('.token-skin-canvas');
        canvases.forEach(cvs => {
            const skinType = cvs.dataset.tokenSkin;
            const pctx = cvs.getContext('2d');
            pctx.clearRect(0, 0, cvs.width, cvs.height);
            this.drawSingleToken(pctx, 30, 36, 1.35, '#ef4444', false, skinType, 0, 26);
        });
    }

    buySkin(type, skinId) {
        const catalog = type === 'dice' ? this.diceSkins : this.tokenSkins;
        const skin = catalog.find(s => s.id === skinId);
        if (!skin) return;

        const ownedList = type === 'dice' ? this.inventory.diceSkins : this.inventory.tokenSkins;
        if (ownedList.includes(skinId)) {
            alert('আপনি ইতিমধ্যে এই স্কিনটি কিনেছেন!');
            return;
        }

        if (this.userStats.coins < skin.price) {
            window.soundFX.playTimerAlert();
            alert(`দুঃখিত! আপনার কাছে পর্যাপ্ত কয়েন নেই। এই স্কিনটি কিনতে ${skin.price.toLocaleString()} কয়েন প্রয়োজন।`);
            return;
        }

        // Deduct coins & add to inventory
        this.addCoins(-skin.price);
        ownedList.push(skinId);

        if (type === 'dice') {
            localStorage.setItem('lx_owned_dice', JSON.stringify(this.inventory.diceSkins));
            this.equipSkin('dice', skinId, false);
        } else {
            localStorage.setItem('lx_owned_tokens', JSON.stringify(this.inventory.tokenSkins));
            this.equipSkin('token', skinId, false);
        }

        window.soundFX.playClaimReward();
        this.launchConfetti();
        alert(`🎉 অভিনন্দন! আপনি সফলভাবে "${skin.nameBn}" স্কিনটি আনলক করেছেন! এটি সক্রিয় করা হয়েছে।`);

        this.updateInventoryUI();
    }

    equipSkin(type, skinId, showAlert = true) {
        const ownedList = type === 'dice' ? this.inventory.diceSkins : this.inventory.tokenSkins;
        if (!ownedList.includes(skinId)) return;

        if (type === 'dice') {
            this.inventory.equippedDice = skinId;
            localStorage.setItem('lx_equipped_dice', skinId);
            this.applyEquippedSkins();
        } else {
            this.inventory.equippedToken = skinId;
            localStorage.setItem('lx_equipped_token', skinId);
        }

        window.soundFX.playClick();
        this.render();
        this.updateInventoryUI();
    }

    updateWalletUI() {
        const coinsEl = document.getElementById('userCoins');
        const gemsEl = document.getElementById('userDiamonds');
        const stCoinsEl = document.getElementById('statTotalCoins');
        const stMatchesEl = document.getElementById('statMatchesPlayed');
        const stWonEl = document.getElementById('statMatchesWon');
        const stLostEl = document.getElementById('statMatchesLost');
        const stWinRateEl = document.getElementById('statWinRate');
        const stCurStreakEl = document.getElementById('statCurrentStreak');
        const stBestStreakEl = document.getElementById('statBestStreak');
        const inputNameEl = document.getElementById('inputPlayerName');
        const levelBadgeEl = document.getElementById('userLevelBadge');
        const profileLevelEl = document.getElementById('profileLevelText');
        const invCoinsEl = document.getElementById('invUserCoins');
        const profileUserIdEl = document.getElementById('profileUserIdDisplay');

        if (profileUserIdEl) {
            const activePid = window.supabaseClient?.playerId || localStorage.getItem('lx_player_id') || 'LXBD-100001';
            profileUserIdEl.textContent = activePid;
        }

        if (coinsEl) coinsEl.textContent = this.userStats.coins.toLocaleString();
        if (gemsEl) gemsEl.textContent = this.userStats.diamonds.toLocaleString();
        if (stCoinsEl) stCoinsEl.textContent = this.userStats.coins.toLocaleString();
        if (stMatchesEl) stMatchesEl.textContent = this.userStats.matchesPlayed || 0;
        if (stWonEl) stWonEl.textContent = this.userStats.matchesWon || 0;
        if (stLostEl) stLostEl.textContent = this.userStats.matchesLost || 0;
        if (stCurStreakEl) stCurStreakEl.textContent = this.userStats.currentStreak || 0;
        if (stBestStreakEl) stBestStreakEl.textContent = this.userStats.highestStreak || 0;
        if (inputNameEl) inputNameEl.value = this.userStats.name;
        if (levelBadgeEl) levelBadgeEl.textContent = `⭐ ${this.userStats.level}`;
        if (profileLevelEl) profileLevelEl.textContent = `Level ${this.userStats.level}`;
        if (invCoinsEl) invCoinsEl.textContent = this.userStats.coins.toLocaleString();

        if (stWinRateEl) {
            const matches = this.userStats.matchesPlayed || 0;
            const won = this.userStats.matchesWon || 0;
            const rate = matches > 0 ? Math.round((won / matches) * 100) : 0;
            stWinRateEl.textContent = rate + '%';
        }

        localStorage.setItem('lx_player_name', this.userStats.name);
        localStorage.setItem('lx_coins', this.userStats.coins);
        localStorage.setItem('lx_diamonds', this.userStats.diamonds);
        localStorage.setItem('lx_level', this.userStats.level);
        localStorage.setItem('lx_matches', this.userStats.matchesPlayed || 0);
        localStorage.setItem('lx_won', this.userStats.matchesWon || 0);
        localStorage.setItem('lx_lost', this.userStats.matchesLost || 0);
        localStorage.setItem('lx_current_streak', this.userStats.currentStreak || 0);
        localStorage.setItem('lx_highest_streak', this.userStats.highestStreak || 0);

        // Supabase Cloud Auto-Sync
        if (window.supabaseClient) {
            window.supabaseClient.triggerAutoSync();
        }
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
        this.boardCacheValid = false;
    }

    bindEvents() {
        const bindFastTap = (el, handler) => {
            if (!el) return;
            let touchMoved = false;
            let startX = 0, startY = 0;
            let lastTapTime = 0;

            el.addEventListener('touchstart', (e) => {
                touchMoved = false;
                if (e.touches && e.touches[0]) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }
            }, { passive: true });

            el.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches[0]) {
                    const dx = Math.abs(e.touches[0].clientX - startX);
                    const dy = Math.abs(e.touches[0].clientY - startY);
                    if (dx > 10 || dy > 10) touchMoved = true;
                }
            }, { passive: true });

            el.addEventListener('touchend', (e) => {
                if (!touchMoved) {
                    const now = Date.now();
                    if (now - lastTapTime > 280) {
                        lastTapTime = now;
                        if (e.cancelable) e.preventDefault();
                        handler(e);
                    }
                }
            });

            el.addEventListener('click', (e) => {
                const now = Date.now();
                if (now - lastTapTime > 320) {
                    lastTapTime = now;
                    handler(e);
                }
            });
        };
        this.bindFastTap = bindFastTap;

        window.addEventListener('resize', () => {
            this.initCanvasSize();
            this.render();
        });

        // 🎯 CRITICAL: Canvas Click & Touch for Token Selection & Board Roll!
        let lastCanvasTap = 0;
        let lastTouchPos = null;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches[0]) {
                lastTouchPos = {
                    clientX: e.touches[0].clientX,
                    clientY: e.touches[0].clientY
                };
            }
        }, { passive: true });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.cancelable) e.preventDefault();
            const now = Date.now();
            if (now - lastCanvasTap < 200) return;
            lastCanvasTap = now;

            let touchEvt = e;
            if (e.changedTouches && e.changedTouches[0]) {
                touchEvt = e.changedTouches[0];
            } else if (lastTouchPos) {
                touchEvt = lastTouchPos;
            }
            this.handleCanvasClick(touchEvt);
        }, { passive: false });

        this.canvas.addEventListener('click', (e) => {
            const now = Date.now();
            if (now - lastCanvasTap < 250) return;
            lastCanvasTap = now;
            this.handleCanvasClick(e);
        });

        // Corner Personal Dice Boxes & Pods Click/Touch Listener (Ludo King Style)
        let lastPodTap = 0;
        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const dBox = document.getElementById(`dice_box_${color}`);
            const pod = document.getElementById(`corner_${color}`) || document.getElementById(`player_pod_${color}`);
            const onPodTap = (e) => {
                const now = Date.now();
                if (now - lastPodTap < 280) return;
                lastPodTap = now;
                if (e && e.cancelable) e.preventDefault();

                // IN ONLINE MULTIPLAYER:
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    // Strictly prevent touching any other player's pod or dice!
                    if (color !== window.networkManager.myColor) {
                        return;
                    }
                    // Prevent touching pod/dice while in bot mode
                    const isBot = window.networkManager.botColors && window.networkManager.botColors.includes(color);
                    if (isBot) {
                        return;
                    }
                    // In online match, tapping your own pod/dice only rolls the dice during WAITING_ROLL.
                    // It MUST NEVER execute moves during SELECTING_TOKEN (moves must be tapped on the board)!
                    const player = this.engine.getCurrentPlayer();
                    if (player.id === color && this.engine.state === 'WAITING_ROLL') {
                        this.executeRoll();
                    }
                    return;
                }

                // OFFLINE PASS & PLAY / VS COMPUTER:
                const player = this.engine.getCurrentPlayer();
                if (player.id === color && player.type === 'human') {
                    if (this.engine.state === 'WAITING_ROLL') {
                        this.executeRoll();
                    } else if (this.engine.state === 'SELECTING_TOKEN' && this.engine.validMoves.length > 0) {
                        this.executeMove(this.engine.validMoves[0].token.id);
                    }
                }
            };

            if (dBox) {
                dBox.addEventListener('click', onPodTap);
                dBox.addEventListener('touchend', onPodTap, { passive: false });
            }
            if (pod) {
                pod.addEventListener('click', onPodTap);
                pod.addEventListener('touchend', onPodTap, { passive: false });
            }
        });


        // Desktop Side Panel Actions
        const sideBtnAuto = document.getElementById('sideBtnAutoPlay');
        if (sideBtnAuto) {
            bindFastTap(sideBtnAuto, () => {
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    window.networkManager.toggleAutoPlay();
                    return;
                }
                this.autoPlay = !this.autoPlay;
                sideBtnAuto.textContent = `🤖 Auto Play: ${this.autoPlay ? 'ON' : 'OFF'}`;
                const btnAutoPlay = document.getElementById('btnAutoPlay');
                if (btnAutoPlay) btnAutoPlay.style.borderColor = this.autoPlay ? 'var(--accent-green)' : 'var(--cell-border)';
                if (this.autoPlay) this.checkAITurn();
            });
        }
        const sideBtnSnd = document.getElementById('sideBtnSound');
        if (sideBtnSnd) {
            bindFastTap(sideBtnSnd, () => {
                window.soundFX.muted = !window.soundFX.muted;
                sideBtnSnd.textContent = `🔊 Sound: ${window.soundFX.muted ? 'OFF' : 'ON'}`;
                const btnSoundToggle = document.getElementById('btnSoundToggle');
                if (btnSoundToggle) btnSoundToggle.textContent = window.soundFX.muted ? '🔇' : '🔊';
            });
        }

        // Bottom Deck Roll Button Click Listener
        const btnRoll = document.getElementById('btnRoll');
        if (btnRoll) {
            bindFastTap(btnRoll, () => {
                const player = this.engine.getCurrentPlayer();
                if (player.type === 'human' && this.engine.state === 'WAITING_ROLL') {
                    this.executeRoll();
                }
            });
        }

        // 4 Corner Personal 3D Dice Boxes Direct Touch / Click Listener
        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const diceBox = document.getElementById(`dice_box_${color}`);
            if (diceBox) {
                bindFastTap(diceBox, () => {
                    if (window.networkManager && window.networkManager.isOnlineMatch) {
                        if (color !== window.networkManager.myColor) return;
                        const isBot = window.networkManager.botColors && window.networkManager.botColors.includes(color);
                        if (isBot) return;
                    }
                    const curPlayer = this.engine ? this.engine.getCurrentPlayer() : null;
                    if (curPlayer && curPlayer.id === color && curPlayer.type === 'human' && this.engine.state === 'WAITING_ROLL') {
                        this.executeRoll();
                    }
                });
            }
        });

        // Auto Play Button (Spectator Mode & Online Bot Toggle)
        this.autoPlay = false;
        const btnAutoPlay = document.getElementById('btnAutoPlay');
        if (btnAutoPlay) {
            btnAutoPlay.style.borderColor = 'var(--cell-border)';
            btnAutoPlay.addEventListener('click', () => {
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    window.networkManager.toggleAutoPlay();
                    return;
                }
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
        const launchGameWithMode = (modeType, vsType, badgeText, customPlayerCount = 4, customNames = null, friendlyKill = false, selectedColors = null, customPlayerTypes = null) => {
            this.lastGameConfig = { modeType, vsType, badgeText, customPlayerCount, customNames, friendlyKill, selectedColors, customPlayerTypes };
            this.stopTurnTimer();
            this.isRolling = false;
            if (this.rollWatchdogTimer) {
                clearTimeout(this.rollWatchdogTimer);
                this.rollWatchdogTimer = null;
            }
            if (this.aiTurnTimeout) {
                clearTimeout(this.aiTurnTimeout);
                this.aiTurnTimeout = null;
            }
            ['red', 'green', 'yellow', 'blue'].forEach(c => {
                const cornerBox = document.getElementById(`dice_box_${c}`);
                if (cornerBox) cornerBox.classList.remove('rolling');
                const scene = cornerBox?.querySelector('.dice-3d-scene');
                if (scene) scene.classList.remove('rolling-shake');
            });

            // Dismiss all open modals cleanly
            document.querySelectorAll('.modal-overlay').forEach(m => {
                m.classList.remove('active');
                m.style.display = 'none';
            });
            const waitingRoomModal = document.getElementById('modalOnlineWaitingRoom');
            if (waitingRoomModal) {
                waitingRoomModal.classList.remove('active');
                waitingRoomModal.style.display = 'none';
            }

            if (window.soundFX?.playClick) window.soundFX.playClick();
            // Hide Home Screen, Show Game Stage
            const homeScreen = document.getElementById('homeScreen');
            const inGameElements = document.querySelectorAll('.in-game-only');
            if (homeScreen) {
                homeScreen.classList.remove('active');
                homeScreen.style.display = 'none';
            }
            inGameElements.forEach(el => el.style.display = (el.tagName === 'HEADER' ? 'flex' : 'flex'));
            if (vsType === 'online') {
                const hud = document.getElementById('onlineMatchLiveHud');
                if (hud) hud.style.display = 'flex';
                if (typeof document !== 'undefined') {
                    document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'inline-flex');
                    document.body?.classList?.add('online-match-active');
                }
            } else {
                const hud = document.getElementById('onlineMatchLiveHud');
                if (hud) hud.style.display = 'none';
                if (typeof document !== 'undefined') {
                    document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'none');
                    document.body?.classList?.remove('online-match-active');
                }
            }

            const badge = document.getElementById('inGameModeBadge');
            if (badge) badge.textContent = badgeText;

            let playerTypes = customPlayerTypes || { red: 'human', green: 'ai', yellow: 'ai', blue: 'ai' };
            if (!customPlayerTypes) {
                if (vsType === 'pass_play') {
                    playerTypes = { red: 'human', green: 'human', yellow: 'human', blue: 'human' };
                } else if (vsType === 'spectator') {
                    playerTypes = { red: 'ai', green: 'ai', yellow: 'ai', blue: 'ai' };
                } else if (vsType === 'team_ai') {
                    playerTypes = { red: 'human', yellow: 'ai', green: 'ai', blue: 'ai' };
                }
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
                    if (customPlayerCount === 2) {
                        activePlayerNames = {
                            red: 'Player 1 (Red)',
                            yellow: 'Player 2 (Yellow)'
                        };
                    } else if (customPlayerCount === 3) {
                        activePlayerNames = {
                            red: 'Player 1 (Red)',
                            green: 'Player 2 (Green)',
                            yellow: 'Player 3 (Yellow)'
                        };
                    } else {
                        activePlayerNames = {
                            red: 'Player 1 (Red)',
                            green: 'Player 2 (Green)',
                            yellow: 'Player 3 (Yellow)',
                            blue: 'Player 4 (Blue)'
                        };
                    }
                } else {
                    activePlayerNames = {
                        red: this.userStats?.name || 'You (Red)',
                        yellow: 'Robot Yellow 🤖',
                        blue: 'Robot Blue 🤖',
                        green: 'Robot Green 🤖'
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

        // Expose launchGameWithMode to the UI controller instance
        this.launchGameWithMode = launchGameWithMode;

        // 1. Play Online (Connects to server & opens Unified Online Lobby)
        const btnOnline = document.getElementById('btnModeOnline');
        if (btnOnline) {
            bindFastTap(btnOnline, () => {
                window.soundFX.playClick();
                if (window.networkManager) {
                    window.networkManager.connect();
                    window.networkManager.updateActiveMatchUI();
                }
                const lobbyCoinEl = document.getElementById('onlineLobbyCoinBalance');
                if (lobbyCoinEl) {
                    lobbyCoinEl.textContent = (this.userStats?.coins || 0).toLocaleString();
                }
                const myNameEl = document.getElementById('lobbySeatRedName');
                if (myNameEl) {
                    myNameEl.textContent = `${this.userStats?.name || 'আপনি'} (হোস্ট)`;
                }
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) {
                    modalOnline.classList.add('active');
                }
            });
        }

        const btnJoinUnified = document.getElementById('btnJoinUnifiedOnlineMatch');
        if (btnJoinUnified) {
            bindFastTap(btnJoinUnified, () => {
                window.soundFX?.playClick();
                if (window.networkManager) {
                    window.networkManager.joinUnifiedOnlineMatch();
                }
            });
        }

        // Royal Lobby: Private Room Drawer Toggle
        const btnTogglePrivate = document.getElementById('btnTogglePrivateRoom');
        const drawerPrivate = document.getElementById('royalPrivateRoomDrawer');
        if (btnTogglePrivate && drawerPrivate) {
            bindFastTap(btnTogglePrivate, () => {
                window.soundFX?.playClick();
                const isHidden = drawerPrivate.style.display === 'none' || drawerPrivate.style.display === '';
                drawerPrivate.style.display = isHidden ? 'block' : 'none';
                btnTogglePrivate.textContent = isHidden 
                    ? '🔑 বন্ধুদের সাথে প্রাইভেট রুমে খেলুন ▲' 
                    : '🔑 বন্ধুদের সাথে প্রাইভেট রুমে খেলুন ▼';
            });
        }

        // Online Lobby Actions
        const btnOnlineQuickMatch = document.getElementById('btnOnlineQuickMatch');
        if (btnOnlineQuickMatch) {
            bindFastTap(btnOnlineQuickMatch, () => {
                window.soundFX.playClick();
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) modalOnline.classList.remove('active');
                if (window.networkManager && window.networkManager.isConnected) {
                    window.networkManager.requestQuickMatch(4);
                } else {
                    launchGameWithMode('CLASSIC', 'online_ai', 'ONLINE 4P');
                }
            });
        }

        const btnOnline1v1 = document.getElementById('btnOnline1v1');
        if (btnOnline1v1) {
            bindFastTap(btnOnline1v1, () => {
                window.soundFX.playClick();
                const modalOnline = document.getElementById('modalOnlineLobby');
                if (modalOnline) modalOnline.classList.remove('active');
                if (window.networkManager && window.networkManager.isConnected) {
                    window.networkManager.requestQuickMatch(2);
                } else {
                    launchGameWithMode('CLASSIC', 'online_ai', 'ONLINE 1v1', 2, {
                        red: `${this.userStats?.name || 'You'} 🇧🇩`,
                        yellow: 'সাকিব_কিং 🇧🇩'
                    }, false, ['red', 'yellow']);
                }
            });
        }

        const btnOnlinePrivateRoom = document.getElementById('btnOnlinePrivateRoom');
        if (btnOnlinePrivateRoom) {
            bindFastTap(btnOnlinePrivateRoom, () => {
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
            bindFastTap(btnTeam, () => {
                launchGameWithMode('TEAM_2V2', 'team_ai', 'TEAM 2v2 (DUO)');
            });
        }

        // 3. Play Friends (Also connects to Play N Play or Private Room)
        const btnFriends = document.getElementById('btnModeFriends');
        if (btnFriends) {
            bindFastTap(btnFriends, () => {
                window.soundFX.playClick();
                const modalPnP = document.getElementById('modalPlayAndPlay');
                if (modalPnP) modalPnP.classList.add('active');
            });
        }

        // 4. Play with Computer (Intuitive 1v1 Red vs Robot Yellow)
        const btnComputer = document.getElementById('btnModeComputer');
        if (btnComputer) {
            bindFastTap(btnComputer, () => {
                launchGameWithMode('CLASSIC', 'vs_ai', 'VS COMPUTER (1v1)', 2, {
                    red: this.userStats?.name || 'You (Red)',
                    yellow: 'Robot Yellow 🤖'
                }, false, ['red', 'yellow']);
            });
        }

        // 5. Pass N Play (Opens Setup Modal for 2P, 3P, 4P or Team 2v2)
        const btnPassPlay = document.getElementById('btnModePassPlay');
        const modalPnP = document.getElementById('modalPlayAndPlay');
        const btnClosePnP = document.getElementById('btnClosePnPModal');
        const btnStartPnP = document.getElementById('btnStartPnPGame');

        if (btnPassPlay && modalPnP) {
            bindFastTap(btnPassPlay, () => {
                window.soundFX.playClick();
                modalPnP.classList.add('active');
            });
        }

        if (btnClosePnP && modalPnP) {
            bindFastTap(btnClosePnP, () => {
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
            bindFastTap(btnStartPnP, () => {
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
                    let badgeText = `PLAY N PLAY (${count}P)`;
                    if (rules === 'QUICK_RUSH') badgeText = `QUICK RUSH (${count}P)`;
                    const selCols = (count === 2) ? ['red', 'yellow'] : (count === 3 ? ['red', 'green', 'yellow'] : null);
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
            bindFastTap(btnCloseTeamUp, () => {
                window.soundFX.playClick();
                modalTeamUp.classList.remove('active');
                const modalPnP = document.getElementById('modalPlayAndPlay');
                if (modalPnP) modalPnP.classList.add('active');
            });
        }

        // Friendly kill toggle
        if (wrapFriendlyKill && chkFriendlyKill) {
            bindFastTap(wrapFriendlyKill, () => {
                window.soundFX.playClick();
                chkFriendlyKill.classList.toggle('checked');
            });
        }

        // Start Team Up (Play normal - all tokens in yard)
        if (btnStartTeamClassic && modalTeamUp) {
            bindFastTap(btnStartTeamClassic, () => {
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
            bindFastTap(btnStartTeamOneToken, () => {
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
            bindFastTap(btnBackHome, () => {
                window.soundFX.playClick();
                if (modalConfirmExit) {
                    modalConfirmExit.classList.add('active');
                } else {
                    this.stopTurnTimer();
                    this.isRolling = false;
                    if (window.networkManager) {
                        window.networkManager.leaveCurrentMatch(false);
                        window.networkManager.leaveLobby(false);
                        window.networkManager.isOnlineMatch = false;
                        window.networkManager.currentTurnColor = null;
                    }
                    const homeScreen = document.getElementById('homeScreen');
                    const inGameElements = document.querySelectorAll('.in-game-only');
                    if (homeScreen) {
                        homeScreen.style.display = 'flex';
                        homeScreen.classList.add('active');
                    }
                    inGameElements.forEach(el => el.style.display = 'none');
                    const hud = document.getElementById('onlineMatchLiveHud');
                    if (hud) hud.style.display = 'none';
                    if (typeof document !== 'undefined') {
                        document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'none');
                        document.body?.classList?.remove('online-match-active');
                    }
                    this.updatePodPositions();
                    this.render();
                }
            });
        }

        if (btnResumeGame && modalConfirmExit) {
            bindFastTap(btnResumeGame, () => {
                window.soundFX.playClick();
                modalConfirmExit.classList.remove('active');
            });
        }

        if (btnCloseConfirmExit && modalConfirmExit) {
            bindFastTap(btnCloseConfirmExit, () => {
                window.soundFX.playClick();
                modalConfirmExit.classList.remove('active');
            });
        }

        if (btnConfirmQuitToHome && modalConfirmExit) {
            bindFastTap(btnConfirmQuitToHome, () => {
                window.soundFX.playClick();
                modalConfirmExit.classList.remove('active');
                const isOnline = !!(window.networkManager && window.networkManager.isOnlineMatch);
                if (!isOnline && this.engine && this.engine.state !== 'GAME_OVER' && this.engine.players) {
                    this.userStats.matchesPlayed = (this.userStats.matchesPlayed || 0) + 1;
                    this.userStats.matchesLost = (this.userStats.matchesLost || 0) + 1;
                    this.userStats.currentStreak = 0;
                    this.updateWalletUI();
                }
                this.stopTurnTimer();
                this.isRolling = false;
                if (window.networkManager) {
                    window.networkManager.leaveCurrentMatch(isOnline ? true : false);
                }
                const homeScreen = document.getElementById('homeScreen');
                const inGameElements = document.querySelectorAll('.in-game-only');
                if (homeScreen) {
                    homeScreen.style.display = 'flex';
                    homeScreen.classList.add('active');
                }
                inGameElements.forEach(el => el.style.display = 'none');
                this.updatePodPositions();
                this.render();
            });
        }

        // Hardware Back Button Handler (Native-to-JS Bridge)
        window.onHardwareBackPressed = () => {
            // 1. If any modal is active, close the topmost modal
            const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
            if (activeModals.length > 0) {
                const topModal = activeModals[activeModals.length - 1];
                topModal.classList.remove('active');
                window.soundFX.playClick();
                return 'handled';
            }

            // 2. If inside active game match, prompt in-game forfeit warning
            const homeScreen = document.getElementById('homeScreen');
            const isLobbyActive = homeScreen && homeScreen.classList.contains('active');
            const isMatchActive = !isLobbyActive && this.engine && this.engine.state !== 'GAME_OVER' && this.engine.players;

            if (isMatchActive) {
                const modalConfirmExit = document.getElementById('modalConfirmExit');
                if (modalConfirmExit) {
                    modalConfirmExit.classList.add('active');
                    window.soundFX.playClick();
                    return 'handled';
                }
            }

            // 3. If on home screen, prompt app exit confirmation
            const modalAppExitConfirm = document.getElementById('modalAppExitConfirm');
            if (modalAppExitConfirm) {
                modalAppExitConfirm.classList.add('active');
                window.soundFX.playClick();
                return 'handled';
            }

            return 'unhandled';
        };

        // App Exit Confirmation Modal Buttons
        const btnConfirmAppExit = document.getElementById('btnConfirmAppExit');
        const btnCancelAppExit = document.getElementById('btnCancelAppExit');
        const modalAppExitConfirm = document.getElementById('modalAppExitConfirm');

        if (btnConfirmAppExit) {
            bindFastTap(btnConfirmAppExit, () => {
                window.soundFX.playClick();
                if (window.AndroidBridge && window.AndroidBridge.exitApp) {
                    window.AndroidBridge.exitApp();
                } else {
                    window.close();
                }
            });
        }
        if (btnCancelAppExit && modalAppExitConfirm) {
            bindFastTap(btnCancelAppExit, () => {
                window.soundFX.playClick();
                modalAppExitConfirm.classList.remove('active');
            });
        }

        // Rate & Share Buttons
        const btnRateGameSettings = document.getElementById('btnRateGameSettings');
        const btnShareGameSettings = document.getElementById('btnShareGameSettings');
        const btnOpenPrivacyPolicy = document.getElementById('btnOpenPrivacyPolicy');
        const btnConfirmRatePrompt = document.getElementById('btnConfirmRatePrompt');
        const btnDismissRatePrompt = document.getElementById('btnDismissRatePrompt');
        const modalRateGamePrompt = document.getElementById('modalRateGamePrompt');
        const modalPrivacyPolicy = document.getElementById('modalPrivacyPolicy');

        const triggerRateApp = () => {
            window.soundFX.playClick();
            localStorage.setItem('lx_last_rate_prompt', Date.now().toString());
            if (modalRateGamePrompt) modalRateGamePrompt.classList.remove('active');
            if (window.AndroidBridge && window.AndroidBridge.rateGame) {
                window.AndroidBridge.rateGame();
            } else {
                window.open('https://play.google.com/store/apps/details?id=com.ludoxbd.game', '_blank');
            }
        };

        const triggerShareApp = () => {
            window.soundFX.playClick();
            const shareText = 'বাংলাদেশের সেরা লুডু গেম Ludo X BD খেলুন! অফলাইন ও বন্ধুদের সাথে খেলুন সম্পূর্ণ ফ্রি। ডাউনলোড লিংক: https://play.google.com/store/apps/details?id=com.ludoxbd.game';
            const shareTitle = 'Ludo X BD গেম ইনভাইটেশন';
            if (window.AndroidBridge && window.AndroidBridge.shareGame) {
                window.AndroidBridge.shareGame(shareText, shareTitle);
            } else if (navigator.share) {
                navigator.share({ title: shareTitle, text: shareText, url: 'https://play.google.com/store/apps/details?id=com.ludoxbd.game' }).catch(() => {});
            } else {
                navigator.clipboard?.writeText(shareText);
                alert('🔗 গেম লিংক কপি করা হয়েছে! বন্ধুদের মেসেঞ্জারে শেয়ার করুন।');
            }
        };

        if (btnRateGameSettings) bindFastTap(btnRateGameSettings, triggerRateApp);
        if (btnConfirmRatePrompt) bindFastTap(btnConfirmRatePrompt, triggerRateApp);
        if (btnDismissRatePrompt && modalRateGamePrompt) {
            bindFastTap(btnDismissRatePrompt, () => {
                window.soundFX.playClick();
                localStorage.setItem('lx_last_rate_prompt', Date.now().toString());
                modalRateGamePrompt.classList.remove('active');
            });
        }
        if (btnShareGameSettings) bindFastTap(btnShareGameSettings, triggerShareApp);
        if (btnOpenPrivacyPolicy && modalPrivacyPolicy) {
            bindFastTap(btnOpenPrivacyPolicy, () => {
                window.soundFX.playClick();
                modalPrivacyPolicy.classList.add('active');
            });
        }

        // Google Play Games Cloud Save Controls
        const btnPlayGamesConnect = document.getElementById('btnPlayGamesConnect');
        if (btnPlayGamesConnect) {
            bindFastTap(btnPlayGamesConnect, () => {
                window.soundFX.playClick();
                if (window.cloudSaveManager) {
                    if (window.cloudSaveManager.isConnected) {
                        window.cloudSaveManager.signOut();
                    } else {
                        window.cloudSaveManager.signIn();
                    }
                }
            });
        }

        const btnPlayGamesSyncNow = document.getElementById('btnPlayGamesSyncNow');
        if (btnPlayGamesSyncNow) {
            bindFastTap(btnPlayGamesSyncNow, () => {
                window.soundFX.playClick();
                if (window.cloudSaveManager) {
                    window.cloudSaveManager.syncNow(false);
                }
            });
        }

        const btnExportBackupJson = document.getElementById('btnExportBackupJson');
        if (btnExportBackupJson) {
            bindFastTap(btnExportBackupJson, () => {
                window.soundFX.playClick();
                if (window.cloudSaveManager) {
                    window.cloudSaveManager.exportJSON();
                }
            });
        }

        // Supabase Cloud Manual Sync Button
        const btnSupabaseSyncNow = document.getElementById('btnSupabaseSyncNow');
        if (btnSupabaseSyncNow) {
            bindFastTap(btnSupabaseSyncNow, () => {
                window.soundFX.playClick();
                if (window.supabaseClient) {
                    window.supabaseClient.syncNow(false);
                } else {
                    alert('সুপাবেজ ক্লায়েন্ট প্রস্তুত হচ্ছে, অনুগ্রহ করে একটু পর চেষ্টা করুন।');
                }
            });
        }

        // Supabase Realtime Reconnect / Status Button
        const btnReconnectSupabase = document.getElementById('btnReconnectSupabaseRealtime');
        if (btnReconnectSupabase) {
            bindFastTap(btnReconnectSupabase, () => {
                window.soundFX.playClick();
                if (window.networkManager) {
                    window.networkManager.connect();
                    if (window.networkManager.sendHeartbeat) {
                        window.networkManager.sendHeartbeat();
                    }
                    window.networkManager.showToast('⚡ সুপাবেজ ক্লাউড সংযোগ সফলভাবে রিফ্রেশ হয়েছে!');
                }
            });
        }

        // Google AdMob Banner Toggle
        const toggleBannerAd = document.getElementById('toggleBannerAdSettings');
        if (toggleBannerAd) {
            bindFastTap(toggleBannerAd, () => {
                window.soundFX.playClick();
                const isCurrentlyActive = toggleBannerAd.classList.contains('active');
                if (isCurrentlyActive) {
                    toggleBannerAd.classList.remove('active');
                    toggleBannerAd.textContent = 'বন্ধ (OFF)';
                    if (window.adMobManager) window.adMobManager.hideBannerAd();
                } else {
                    toggleBannerAd.classList.add('active');
                    toggleBannerAd.textContent = 'চালু (ON)';
                    if (window.adMobManager) window.adMobManager.showBannerAd();
                }
            });
        }

        this.initDailyRewards();
        this.initLuckySpin();




        const openStoreModal = () => {
            window.soundFX.playClick();
            const modalStore = document.getElementById('modalStoreTab');
            if (modalStore) modalStore.classList.add('active');
        };

        const btnCoinsAdd = document.getElementById('btnCoinsAdd');
        if (btnCoinsAdd) {
            btnCoinsAdd.addEventListener('click', (e) => {
                e.stopPropagation();
                openStoreModal();
            });
        }

        const btnGemsAdd = document.getElementById('btnGemsAdd');
        if (btnGemsAdd) {
            btnGemsAdd.addEventListener('click', (e) => {
                e.stopPropagation();
                openStoreModal();
            });
        }

        // Tapping coins or gems wallet pill opens store
        document.querySelectorAll('.lk-wallet-pill').forEach(pill => {
            pill.style.cursor = 'pointer';
            pill.addEventListener('click', () => {
                openStoreModal();
            });
        });

        // Mode Switcher / New Game
        const btnNewGame = document.getElementById('btnNewGame');
        if (btnNewGame) {
            btnNewGame.addEventListener('click', () => {
                document.getElementById('modalNewGame').classList.add('active');
            });
        }

        document.getElementById('btnStartCustomGame')?.addEventListener('click', () => {
            const mode = document.getElementById('selectMode')?.value || 'CLASSIC';
            const count = parseInt(document.getElementById('selectPlayers')?.value || '4', 10);
            const vsType = document.getElementById('selectVs')?.value || 'computer';
            this.botDifficulty = document.getElementById('selectBotDifficulty')?.value || 'medium';

            const badgeText = (mode === 'TEAM_2V2') ? 'TEAM 2v2' : `${mode} (${count}P)`;
            if (typeof launchGameWithMode === 'function') {
                launchGameWithMode(mode, vsType, badgeText, count);
            }
            document.getElementById('modalNewGame')?.classList.remove('active');
        });

        // Power-Up Buttons
        document.getElementById('btnPowerShield')?.addEventListener('click', () => {
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

        document.getElementById('btnPowerReroll')?.addEventListener('click', () => {
            if (this.engine.usePowerUp('reroll')) {
                window.soundFX.playPowerUp();
                this.updatePowerUpsUI();
                this.updateDiceUI(this.engine.diceValue);
                this.render();
            }
        });

        document.getElementById('btnPowerJump')?.addEventListener('click', () => {
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
        document.getElementById('btnSoundToggle')?.addEventListener('click', (e) => {
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
            bindFastTap(btn, () => {
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
            bindFastTap(btnUserProfile, () => {
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
                this.applyAvatar(avatarKey);
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

        // User ID Copy Button
        const btnCopyUserId = document.getElementById('btnCopyUserId');
        if (btnCopyUserId) {
            btnCopyUserId.addEventListener('click', async () => {
                const activePid = window.supabaseClient?.playerId || localStorage.getItem('lx_player_id') || 'LXBD-100001';
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(activePid);
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = activePid;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                    }
                    if (window.soundFX?.playClick) window.soundFX.playClick();
                    
                    const origHtml = btnCopyUserId.innerHTML;
                    btnCopyUserId.innerHTML = '✅ কপি হয়েছে!';
                    btnCopyUserId.classList.add('copied');
                    setTimeout(() => {
                        btnCopyUserId.innerHTML = origHtml;
                        btnCopyUserId.classList.remove('copied');
                    }, 2000);
                } catch (e) {
                    alert(`আপনার ইউজার আইডি: ${activePid}`);
                }
            });
        }

        // Account Recovery / Login with User ID
        const btnRecover = document.getElementById('btnRecoverAccount');
        const inputRecover = document.getElementById('inputRecoveryUserId');
        const msgRecover = document.getElementById('recoveryStatusMsg');
        if (btnRecover && inputRecover) {
            const handleRecovery = async () => {
                let rawInput = inputRecover.value.trim().toUpperCase();
                if (!rawInput) {
                    if (msgRecover) {
                        msgRecover.style.display = 'block';
                        msgRecover.className = 'recovery-status-msg error';
                        msgRecover.textContent = '⚠️ অনুগ্রহ করে একটি সঠিক ইউজার আইডি লিখুন (যেমন: LXBD-749215)';
                    }
                    inputRecover.focus();
                    return;
                }

                // If user just entered 6 digits, auto-prefix LXBD-
                if (/^\d{6}$/.test(rawInput)) {
                    rawInput = 'LXBD-' + rawInput;
                    inputRecover.value = rawInput;
                }

                const currentPid = window.supabaseClient?.playerId || localStorage.getItem('lx_player_id');
                if (currentPid && currentPid.toUpperCase() === rawInput) {
                    if (msgRecover) {
                        msgRecover.style.display = 'block';
                        msgRecover.className = 'recovery-status-msg info';
                        msgRecover.textContent = 'ℹ️ আপনি বর্তমানে এই আইডিতেই সক্রিয় আছেন!';
                    }
                    return;
                }

                // Show loading state
                btnRecover.disabled = true;
                const originalBtnText = btnRecover.textContent;
                btnRecover.textContent = '⏳ খোঁজা হচ্ছে...';
                if (msgRecover) {
                    msgRecover.style.display = 'block';
                    msgRecover.className = 'recovery-status-msg loading';
                    msgRecover.textContent = '🔍 ক্লাউড সার্ভার ও লোকাল ডাটাবেজে ইউজার আইডি খোঁজা হচ্ছে...';
                }

                try {
                    let result = null;
                    if (window.supabaseClient && typeof window.supabaseClient.fetchProfile === 'function') {
                        result = await window.supabaseClient.fetchProfile(rawInput);
                    } else {
                        const localBackup = localStorage.getItem('lx_profile_backup_' + rawInput);
                        if (localBackup) {
                            result = { ok: true, source: 'local', profile: JSON.parse(localBackup) };
                        }
                    }

                    if (result && result.ok && result.profile) {
                        const prof = result.profile;
                        
                        // Switch active ID
                        if (window.supabaseClient) {
                            window.supabaseClient.setPlayerId(rawInput);
                        } else {
                            localStorage.setItem('lx_player_id', rawInput);
                        }

                        // Restore User Stats
                        this.userStats.name = prof.name || 'Pro Player BD';
                        this.userStats.avatar = prof.avatar || 'king';
                        this.userStats.coins = parseInt(prof.coins || 5050, 10);
                        this.userStats.diamonds = parseInt(prof.diamonds || 50, 10);
                        this.userStats.level = parseInt(prof.level || 1, 10);
                        this.userStats.matchesPlayed = parseInt(prof.matches_played || prof.matchesPlayed || 0, 10);
                        this.userStats.matchesWon = parseInt(prof.matches_won || prof.matchesWon || 0, 10);
                        this.userStats.matchesLost = parseInt(prof.matches_lost || prof.matchesLost || 0, 10);
                        this.userStats.currentStreak = parseInt(prof.current_streak || prof.currentStreak || 0, 10);
                        this.userStats.highestStreak = parseInt(prof.highest_streak || prof.highestStreak || 0, 10);

                        // Restore inventory
                        if (prof.inventory) {
                            const inv = typeof prof.inventory === 'string' ? JSON.parse(prof.inventory) : prof.inventory;
                            if (inv.equippedDice) {
                                this.inventory.equippedDice = inv.equippedDice;
                                localStorage.setItem('lx_equipped_dice', inv.equippedDice);
                            }
                            if (inv.equippedToken || inv.equippedBoard) {
                                const tokenKey = inv.equippedToken || inv.equippedBoard;
                                this.inventory.equippedToken = tokenKey;
                                localStorage.setItem('lx_equipped_token', tokenKey);
                            }
                            if (Array.isArray(inv.diceSkins)) {
                                this.inventory.diceSkins = inv.diceSkins;
                                localStorage.setItem('lx_owned_dice', JSON.stringify(inv.diceSkins));
                            }
                        }

                        // Persist to storage
                        localStorage.setItem('lx_player_name', this.userStats.name);
                        localStorage.setItem('lx_avatar', this.userStats.avatar);
                        localStorage.setItem('lx_coins', this.userStats.coins);
                        localStorage.setItem('lx_diamonds', this.userStats.diamonds);
                        localStorage.setItem('lx_level', this.userStats.level);
                        localStorage.setItem('lx_matches', this.userStats.matchesPlayed);
                        localStorage.setItem('lx_won', this.userStats.matchesWon);
                        localStorage.setItem('lx_lost', this.userStats.matchesLost);
                        localStorage.setItem('lx_current_streak', this.userStats.currentStreak);
                        localStorage.setItem('lx_highest_streak', this.userStats.highestStreak);

                        // Refresh active avatar picker UI
                        document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.avatar === this.userStats.avatar);
                        });

                        // Update all UI components
                        this.applyAvatar(this.userStats.avatar);
                        this.updateWalletUI();
                        this.updateInventoryUI();
                        if (typeof this.applyEquippedSkins === 'function') this.applyEquippedSkins();
                        if (typeof this.render === 'function') this.render();

                        inputRecover.value = '';
                        if (window.soundFX?.playWin) window.soundFX.playWin();

                        if (msgRecover) {
                            msgRecover.style.display = 'block';
                            msgRecover.className = 'recovery-status-msg success';
                            msgRecover.innerHTML = `🎉 <strong>স্বাগতম, ${this.userStats.name}!</strong><br>অ্যাকাউন্ট সফলভাবে রিকভার হয়েছে।<br>💰 কয়েন: ${this.userStats.coins.toLocaleString()} | 💎 ডায়মন্ড: ${this.userStats.diamonds} | ⭐ লেভেল: ${this.userStats.level}`;
                        }
                    } else {
                        if (window.soundFX?.playKill) window.soundFX.playKill();
                        if (msgRecover) {
                            msgRecover.style.display = 'block';
                            msgRecover.className = 'recovery-status-msg error';
                            msgRecover.innerHTML = `❌ <strong>অ্যাকাউন্ট পাওয়া যায়নি!</strong><br>ইউজার আইডি <code>${rawInput}</code> সঠিক নয় অথবা ডাটাবেজে এখনো সংরক্ষিত হয়নি।`;
                        }
                    }
                } catch (err) {
                    console.error('Account recovery error:', err);
                    if (msgRecover) {
                        msgRecover.style.display = 'block';
                        msgRecover.className = 'recovery-status-msg error';
                        msgRecover.textContent = '⚠️ রিকভারি প্রক্রিয়ায় ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন।';
                    }
                } finally {
                    btnRecover.disabled = false;
                    btnRecover.textContent = originalBtnText;
                }
            };

            btnRecover.addEventListener('click', handleRecovery);
            inputRecover.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRecovery();
                }
            });
        }

        // 2. Settings Modal
        const btnHomeSettings = document.getElementById('btnHomeSettings');
        const modalHomeSettings = document.getElementById('modalHomeSettings');
        const toggleBgmSettings = document.getElementById('toggleBgmSettings');
        const toggleSoundSettings = document.getElementById('toggleSoundSettings');
        const toggleVibrationSettings = document.getElementById('toggleVibrationSettings');
        const toggleVoiceSettings = document.getElementById('toggleVoiceSettings');
        const toggleAutoPlay = document.getElementById('toggleAutoPlaySettings');

        const updateSettingsUI = () => {
            if (toggleBgmSettings) {
                const bgmOn = !window.soundFX.bgmMuted;
                toggleBgmSettings.textContent = bgmOn ? 'চালু (ON)' : 'বন্ধ (OFF)';
                toggleBgmSettings.classList.toggle('active', bgmOn);
            }
            if (toggleSoundSettings) {
                const sfxOn = !window.soundFX.muted;
                toggleSoundSettings.textContent = sfxOn ? 'চালু (ON)' : 'বন্ধ (OFF)';
                toggleSoundSettings.classList.toggle('active', sfxOn);
                const btnHeaderSound = document.getElementById('btnSoundToggle');
                if (btnHeaderSound) btnHeaderSound.textContent = sfxOn ? '🔊' : '🔇';
            }
            if (toggleVibrationSettings) {
                const vibOn = window.soundFX.vibrationEnabled;
                toggleVibrationSettings.textContent = vibOn ? 'চালু (ON)' : 'বন্ধ (OFF)';
                toggleVibrationSettings.classList.toggle('active', vibOn);
            }
            if (toggleVoiceSettings) {
                const voiceOn = window.soundFX.voiceEnabled;
                toggleVoiceSettings.textContent = voiceOn ? 'চালু (ON)' : 'বন্ধ (OFF)';
                toggleVoiceSettings.classList.toggle('active', voiceOn);
            }
            if (toggleAutoPlay) {
                toggleAutoPlay.textContent = this.autoPlay ? 'চালু (ON)' : 'বন্ধ (OFF)';
                toggleAutoPlay.classList.toggle('active', this.autoPlay);
            }
            // Sync Board Theme cards
            const curBoardTheme = this.boardTheme || 'white';
            const btnThemeDark = document.getElementById('btnThemeDark');
            const btnThemeWhite = document.getElementById('btnThemeWhite');
            if (btnThemeDark) btnThemeDark.classList.toggle('active', curBoardTheme === 'dark');
            if (btnThemeWhite) btnThemeWhite.classList.toggle('active', curBoardTheme === 'white');
        };

        // Initial sync of settings UI
        updateSettingsUI();

        if (btnHomeSettings && modalHomeSettings) {
            bindFastTap(btnHomeSettings, () => {
                window.soundFX.playClick();
                updateSettingsUI();
                modalHomeSettings.classList.add('active');
            });
        }

        // In-Game Top Header Settings button
        const btnInGameSettings = document.getElementById('btnInGameSettings');
        if (btnInGameSettings && modalHomeSettings) {
            bindFastTap(btnInGameSettings, () => {
                window.soundFX.playClick();
                updateSettingsUI();
                modalHomeSettings.classList.add('active');
            });
        }

        // Board Theme Toggle Buttons (Dark vs White)
        const btnThemeDark = document.getElementById('btnThemeDark');
        const btnThemeWhite = document.getElementById('btnThemeWhite');
        if (btnThemeDark) {
            bindFastTap(btnThemeDark, () => {
                window.soundFX.playClick();
                this.setBoardTheme('dark');
                updateSettingsUI();
            });
        }
        if (btnThemeWhite) {
            bindFastTap(btnThemeWhite, () => {
                window.soundFX.playClick();
                this.setBoardTheme('white');
                updateSettingsUI();
            });
        }

        if (toggleBgmSettings) {
            toggleBgmSettings.addEventListener('click', () => {
                window.soundFX.playClick();
                window.soundFX.toggleBGM();
                updateSettingsUI();
            });
        }

        if (toggleSoundSettings) {
            toggleSoundSettings.addEventListener('click', () => {
                window.soundFX.toggleSFX();
                if (!window.soundFX.muted) window.soundFX.playClick();
                updateSettingsUI();
            });
        }

        if (toggleVibrationSettings) {
            toggleVibrationSettings.addEventListener('click', () => {
                window.soundFX.playClick();
                window.soundFX.toggleVibration();
                updateSettingsUI();
            });
        }

        if (toggleVoiceSettings) {
            toggleVoiceSettings.addEventListener('click', () => {
                window.soundFX.playClick();
                window.soundFX.toggleVoice();
                updateSettingsUI();
            });
        }

        if (toggleAutoPlay) {
            toggleAutoPlay.addEventListener('click', () => {
                window.soundFX.playClick();
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    window.networkManager.toggleAutoPlay();
                    return;
                }
                this.autoPlay = !this.autoPlay;
                updateSettingsUI();
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
            bindFastTap(btn7Up, () => {
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
            bindFastTap(btnTourney, () => {
                window.soundFX.playClick();
                modalTourney.classList.add('active');
            });
        }
        const btnRegTourney = document.getElementById('btnRegisterTournament');
        if (btnRegTourney) {
            bindFastTap(btnRegTourney, () => {
                window.soundFX.playClaimReward();
                this.launchConfetti();
                modalTourney.classList.remove('active');
                alert('🎟️ সিজন ২১ গ্র্যান্ড টুর্নামেন্টে আপনার রেজিস্ট্রেশন সম্পন্ন হয়েছে!');
            });
        }

        this.initSnakeLadderGame();


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
            bindFastTap(tabHome, () => {
                window.soundFX.playClick();
                document.querySelectorAll('.lk-nav-tab').forEach(t => t.classList.remove('active'));
                tabHome.classList.add('active');
                const homeScreen = document.getElementById('homeScreen');
                if (homeScreen) {
                    homeScreen.style.display = 'flex';
                    homeScreen.classList.add('active');
                }
                document.querySelectorAll('.in-game-only').forEach(el => el.style.display = 'none');
            });
        }
        if (tabEvent && modalEventsTab) {
            bindFastTap(tabEvent, () => {
                window.soundFX.playClick();
                modalEventsTab.classList.add('active');
            });
        }
        if (tabSocial && modalSocialTab) {
            bindFastTap(tabSocial, () => {
                window.soundFX.playClick();
                modalSocialTab.classList.add('active');
            });
        }
        const btnCreateRoom = document.getElementById('btnCreatePrivateRoom');
        if (btnCreateRoom) {
            bindFastTap(btnCreateRoom, () => {
                window.soundFX.playWin();
                if (window.networkManager) {
                    window.networkManager.createPrivateRoom(4);
                } else {
                    const code = Math.floor(100000 + Math.random() * 900000);
                    const inputCode = document.getElementById('inputRoomCode');
                    if (inputCode) inputCode.value = code;
                    alert(`🎲 নতুন রুম তৈরি হয়েছে! কোড: ${code}\nবন্ধুদের সাথে শেয়ার করুন।`);
                }
            });
        }
        const btnJoinRoom = document.getElementById('btnJoinPrivateRoom');
        if (btnJoinRoom) {
            bindFastTap(btnJoinRoom, () => {
                const inputCode = document.getElementById('inputRoomCode');
                const code = inputCode ? inputCode.value.trim() : '';
                if (code.length >= 4) {
                    if (window.networkManager) {
                        window.networkManager.joinPrivateRoom(code);
                    } else {
                        modalSocialTab.classList.remove('active');
                        launchGameWithMode('CLASSIC', 'pass_play', `ROOM #${code}`);
                    }
                } else {
                    alert('অনুগ্রহ করে সঠিক রুম কোড দিন!');
                }
            });
        }

        if (tabInventory && modalInventoryTab) {
            bindFastTap(tabInventory, () => {
                window.soundFX.playClick();
                this.updateInventoryUI();
                modalInventoryTab.classList.add('active');
            });
        }
        if (tabStore && modalStoreTab) {
            bindFastTap(tabStore, () => {
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
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    const boardId = window.networkManager.currentRoom?.boardId || 'dhaka';
                    const entryFee = window.networkManager.currentRoom?.entryFee || 500;
                    window.networkManager.leaveCurrentMatch();
                    window.networkManager.joinBoard(boardId, entryFee);
                } else if (this.lastGameConfig) {
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
                this.isRolling = false;
                if (window.networkManager) {
                    window.networkManager.leaveCurrentMatch(true); // Permanent completion of match
                }
                const homeScreen = document.getElementById('homeScreen');
                const inGameElements = document.querySelectorAll('.in-game-only');
                if (homeScreen) {
                    homeScreen.style.display = 'flex';
                    homeScreen.classList.add('active');
                }
                inGameElements.forEach(el => el.style.display = 'none');
                const hud = document.getElementById('onlineMatchLiveHud');
                if (hud) hud.style.display = 'none';
                if (typeof document !== 'undefined') {
                    document.querySelectorAll?.('.online-match-only')?.forEach(el => el.style.display = 'none');
                    document.body?.classList?.remove('online-match-active');
                }
                this.updatePodPositions();
                this.render();
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
        if (window.soundFX && typeof window.soundFX.vibrate === 'function') {
            window.soundFX.vibrate(pattern);
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

    setBoardTheme(themeName) {
        this.boardTheme = (themeName === 'white') ? 'white' : 'dark';
        localStorage.setItem('lx_board_theme', this.boardTheme);
        const boardContainer = document.querySelector('.board-container');
        if (boardContainer) {
            boardContainer.setAttribute('data-board-theme', this.boardTheme);
        }
        this.boardCacheValid = false;
        this.render();
    }

    startTurnTimer(duration = 15, phase = 'WAITING_ROLL') {
        this.stopTurnTimer();
        // Turn timer disabled per user request
        return;

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
        if (window.networkManager && window.networkManager.isOnlineMatch) return;

        if (this.turnTimerPhase === 'WAITING_ROLL') {
            this.setBannerText(`⏱️ ${curPlayer.name}-এর সময় শেষ!`, 'স্বয়ংক্রিয়ভাবে চাল দেওয়া হচ্ছে...');
            window.soundFX.playDiceRoll();
            const cornerDiceBox = document.getElementById(`dice_box_${curPlayer.id}`);
            const cornerCube = document.getElementById(`cube_${curPlayer.id}`);
            const scene = cornerCube?.closest('.dice-3d-scene');

            if (cornerDiceBox) cornerDiceBox.classList.add('rolling');
            if (scene) scene.classList.add('rolling-shake');
            if (cornerCube) cornerCube.className = `dice-3d-cube tumble-roll dice-skin-${this.inventory?.equippedDice || 'classic'}`;

            setTimeout(() => {
                if (cornerDiceBox) cornerDiceBox.classList.remove('rolling');
                if (scene) scene.classList.remove('rolling-shake');
                const rollRes = this.engine.rollDice();
                if (!rollRes) {
                    if (cornerCube) cornerCube.className = `dice-3d-cube show-6 dice-skin-${this.inventory?.equippedDice || 'classic'}`;
                    return;
                }

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
        if (this.isRolling || this.engine.state !== 'WAITING_ROLL') return;

        // In real online multiplayer, send roll request to server
        if (window.networkManager && window.networkManager.isOnlineMatch) {
            const curPlayer = this.engine.getCurrentPlayer();
            if (curPlayer.id !== window.networkManager.myColor) {
                window.networkManager.showToast('এখন আপনার চাল নয়!');
                return;
            }
            window.soundFX.playDiceRoll();
            window.soundFX.vibrate(35);
            window.networkManager.rollDice();
            return;
        }

        this.isRolling = true;
        this.stopTurnTimer();
        window.soundFX.playDiceRoll();
        window.soundFX.vibrate(35);

        // Safety watchdog: ensure isRolling is never stuck in any condition
        if (this.rollWatchdogTimer) clearTimeout(this.rollWatchdogTimer);
        this.rollWatchdogTimer = setTimeout(() => {
            this.isRolling = false;
        }, 1100);

        const curPlayer = this.engine.getCurrentPlayer();
        const cornerDiceBox = document.getElementById(`dice_box_${curPlayer.id}`);
        const cornerCube = document.getElementById(`cube_${curPlayer.id}`);
        const scene = cornerCube?.closest('.dice-3d-scene');

        if (cornerDiceBox) cornerDiceBox.classList.add('rolling');
        if (scene) scene.classList.add('rolling-shake');
        if (cornerCube) cornerCube.className = `dice-3d-cube tumble-roll dice-skin-${this.inventory?.equippedDice || 'classic'}`;

        // Allow user to visibly enjoy the spinning 3D tumble (450ms)
        setTimeout(() => {
            this.isRolling = false;
            if (this.rollWatchdogTimer) {
                clearTimeout(this.rollWatchdogTimer);
                this.rollWatchdogTimer = null;
            }
            if (cornerDiceBox) cornerDiceBox.classList.remove('rolling');
            if (scene) scene.classList.remove('rolling-shake');
            
            let result;
            try {
                result = this.engine.rollDice();
            } catch (err) {
                console.error("[Ludo Engine] Roll error:", err);
                this.isRolling = false;
                return;
            }

            if (!result) {
                this.isRolling = false;
                if (cornerCube) cornerCube.className = `dice-3d-cube show-6 dice-skin-${this.inventory?.equippedDice || 'classic'}`;
                return;
            }

            // Immediately display the exact dice value on the 3D cube
            this.updateDiceUI(result.dice);

            if (result.dice === 6) {
                window.soundFX.vibrate([45, 30, 85]);
                window.soundFX.speakBengali('ছক্কা!');
            }

            if (result.threeSixesCanceled) {
                this.isRolling = false;
                window.soundFX.vibrate([120, 60, 120]);
                window.soundFX.speakBengali('চাল বাতিল!');
                this.setBannerText('৩টি ছক্কা পড়েছে!', 'পরপর ৩ বার ৬ পড়ায় চাল বাতিল হয়েছে');
                this.updatePlayerPods();
                this.render();
                setTimeout(() => {
                    this.isRolling = false;
                    this.engine.passTurn();
                    this.updatePlayerPods();
                    this.render();
                    this.checkAITurn();
                }, 800);
                return;
            }

            if (result.noMoves) {
                this.isRolling = false;
                this.setBannerText(`🎲 ${result.dice} পড়েছে!`, 'কোনো চাল নেই, পরের জনের টার্ন');
                this.updatePlayerPods();
                this.render();
                setTimeout(() => {
                    this.isRolling = false;
                    this.engine.passTurn();
                    this.updatePlayerPods();
                    this.render();
                    this.checkAITurn();
                }, 800);
                return;
            }

            // If human has exactly 1 valid move OR all movable tokens are in the yard (rolling 6 with no tokens on track):
            const player = this.engine.getCurrentPlayer();
            const allInYard = result.validTokens.length > 0 && result.validTokens.every(m => m.type === 'EXIT_YARD');

            if (player.type === 'human' && (result.validTokens.length === 1 || allInYard)) {
                this.setBannerText(`🎲 ${result.dice} পড়েছে!`, allInYard ? 'ঘুঁটি ঘর থেকে বের হচ্ছে...' : 'ঘুঁটি এগিয়ে চলছে...');
                setTimeout(() => {
                    this.isRolling = false;
                    this.executeMove(result.validTokens[0].token.id);
                }, 450);
            } else {
                this.isRolling = false;
                this.setBannerText(`🎲 ${result.dice} পড়েছে!`, 'ঘুঁটি সিলেক্ট করুন');
                this.render();
            }
        }, 450);
    }

    // ============================================================
    // Authoritative Online Multiplayer Dice Roll Execution
    // ============================================================
    executeOnlineRoll(color, roll, isAuto = false) {
        if (!this.engine) return;

        // Ensure engine's currentTurnIndex is strictly aligned to the rolling player
        if (this.engine.players) {
            const expIdx = this.engine.players.findIndex(p => p.id === color);
            if (expIdx !== -1 && this.engine.currentTurnIndex !== expIdx) {
                this.engine.currentTurnIndex = expIdx;
            }
        }
        this.engine.state = 'WAITING_ROLL';

        this.isRolling = true;
        this.stopTurnTimer();
        if (window.networkManager && window.networkManager.isOnlineMatch) {
            window.networkManager.clearTurnTimers();
        }
        window.soundFX.playDiceRoll();
        window.soundFX.vibrate(35);

        // Pre-synchronize engine state IMMEDIATELY so validMoves and diceValue are authoritative
        // without waiting for the visual tumble (eliminates remote move desync & teleportation)
        let result = null;
        try {
            result = this.engine.rollDice(roll);
        } catch (err) {
            console.error("[Online Match] Immediate roll engine error:", err);
        }

        // Visual Isolation: Active player's corner dice pod performs authentic 3D tumble
        ['red', 'green', 'yellow', 'blue'].forEach(c => {
            const b = document.getElementById(`dice_box_${c}`);
            const cube = document.getElementById(`cube_${c}`);
            const sc = cube?.closest('.dice-3d-scene');
            if (c === color) {
                if (b) b.classList.add('rolling');
                if (sc) sc.classList.add('rolling-shake');
                if (cube) cube.className = `dice-3d-cube tumble-roll dice-skin-${this.inventory?.equippedDice || 'classic'}`;
            } else {
                if (b) b.classList.remove('rolling');
                if (sc) sc.classList.remove('rolling-shake');
                if (cube) cube.classList.remove('tumble-roll');
            }
        });

        // Fast, snappy 260ms 3D tumble for responsive real-time feel
        setTimeout(() => {
            this.isRolling = false;
            ['red', 'green', 'yellow', 'blue'].forEach(c => {
                const b = document.getElementById(`dice_box_${c}`);
                const cube = document.getElementById(`cube_${c}`);
                const sc = cube?.closest('.dice-3d-scene');
                if (b) b.classList.remove('rolling');
                if (sc) sc.classList.remove('rolling-shake');
                if (c === color && cube) {
                    cube.className = `dice-3d-cube show-${roll} dice-skin-${this.inventory?.equippedDice || 'classic'}`;
                }
            });

            if (!result) {
                try {
                    result = this.engine.rollDice(roll);
                } catch (e) {
                    console.error("[Online Match] Fallback roll engine error:", e);
                }
            }

            if (!result) {
                this.isRolling = false;
                return;
            }

            this.updateDiceUI(result.dice);

            if (result.dice === 6) {
                window.soundFX.vibrate([45, 30, 85]);
                window.soundFX.speakBengali('ছক্কা!');
            }

            if (result.threeSixesCanceled || result.noMoves) {
                this.isRolling = false;
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    window.networkManager.clearTurnTimers();
                }
                if (result.threeSixesCanceled) {
                    window.soundFX.vibrate([120, 60, 120]);
                    window.soundFX.speakBengali('চাল বাতিল!');
                    this.setBannerText('৩টি ছক্কা পড়েছে!', 'পরপর ৩ বার ৬ পড়ায় চাল বাতিল হয়েছে');
                } else {
                    this.setBannerText(`🎲 ${result.dice} পড়েছে!`, 'কোনো চাল নেই, পরবর্তী জনের টার্ন');
                }
                this.updatePlayerPods();
                this.render();

                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    const isMyTurn = (window.networkManager.myColor === color);
                    const isBot = (window.networkManager.botColors && window.networkManager.botColors.includes(color));
                    const shouldAdvance = isMyTurn || isBot;
                    if (shouldAdvance) {
                        setTimeout(() => {
                            window.networkManager.passTurnToNext(color);
                        }, 350);
                    }
                } else {
                    setTimeout(() => {
                        this.engine.passTurn();
                        this.updatePlayerPods();
                        this.render();
                        this.checkAITurn();
                    }, 350);
                }
                return;
            }

            const isLocalPlayer = (window.networkManager && color === window.networkManager.myColor);
            const isBot = (window.networkManager && window.networkManager.botColors && window.networkManager.botColors.includes(color));
            const allInYard = result.validTokens.length > 0 && result.validTokens.every(m => m.type === 'EXIT_YARD');

            if (isBot) {
                this.isRolling = false;
                this.setBannerText(`🎲 ${result.dice} পড়েছে!`, `রোবট (${color.toUpperCase()}) ঘুঁটি চালছে...`);
                this.render();

                // Single Source of Execution for Bot Moves:
                // Only local owner, or designated Bot Leader if owner is disconnected, executes and broadcasts.
                const activeHumans = window.networkManager ? ['red', 'green', 'yellow', 'blue'].filter(c => !window.networkManager.botColors.includes(c)) : [];
                const isBotLeader = (window.networkManager && activeHumans[0] === window.networkManager.myColor);
                const isConnected = window.networkManager ? window.networkManager.isPeerActive(color) : false;
                const shouldExecuteAndBroadcast = isLocalPlayer || (isBotLeader && !isConnected);

                if (shouldExecuteAndBroadcast) {
                    setTimeout(() => {
                        const bestTokenId = window.networkManager?.selectBestLegalMove(this.engine) ?? (result.validTokens[0] ? result.validTokens[0].token.id : null);
                        if (bestTokenId !== null && bestTokenId !== undefined) {
                            if (window.networkManager && window.networkManager.isOnlineMatch) {
                                window.networkManager.moveToken(bestTokenId, color);
                            }
                            this.executeMove(bestTokenId, false, color);
                        } else {
                            window.networkManager?.passTurnToNext(color);
                        }
                    }, 350);
                } else {
                    // Non-executing peers wait for authoritative TOKEN_MOVED.
                    // Fallback safety watchdog (2500ms): in case remote broadcast is lost in network, advance locally
                    setTimeout(() => {
                        if (this.engine.state === 'SELECTING_TOKEN' && this.engine.getCurrentPlayer().id === color) {
                            console.log(`[Bot Move Watchdog] Remote move not received for ${color}, advancing locally`);
                            const bestTokenId = window.networkManager?.selectBestLegalMove(this.engine) ?? (result.validTokens[0] ? result.validTokens[0].token.id : null);
                            if (bestTokenId !== null && bestTokenId !== undefined) {
                                this.executeMove(bestTokenId, true, color);
                            } else {
                                window.networkManager?.passTurnToNext(color);
                            }
                        }
                    }, 2500);
                }
            } else if (isLocalPlayer) {
                if (result.validTokens.length === 1 || allInYard) {
                    this.setBannerText(`🎲 ${result.dice} পড়েছে!`, allInYard ? 'ঘুঁটি ঘর থেকে বের হচ্ছে...' : 'ঘুঁটি এগিয়ে চলছে...');
                    setTimeout(() => {
                        this.isRolling = false;
                        this.executeMove(result.validTokens[0].token.id, false, color);
                    }, 150);
                } else {
                    this.isRolling = false;
                    this.setBannerText(`🎲 ${result.dice} পড়েছে!`, 'ঘুঁটি সিলেক্ট করুন (১৫ সেকেন্ড)');
                    this.render();
                    if (window.networkManager && window.networkManager.isOnlineMatch) {
                        window.networkManager.startStageBTokenMove(color, window.networkManager.currentTurnSeq);
                    }
                }
            } else {
                this.isRolling = false;
                this.setBannerText(`🎲 ${result.dice} পড়েছে!`, `প্রতিপক্ষ (${color.toUpperCase()}) ঘুঁটি চালছে...`);
                this.render();
                if (window.networkManager && window.networkManager.isOnlineMatch) {
                    window.networkManager.startStageBTokenMove(color, window.networkManager.currentTurnSeq);
                }
            }
        }, 260);
    }

    buildAuthoritativePath(token, auth) {
        if (!token || !auth) return [];
        const ownerColor = auth.color || token.color || 'red';
        const pData = (typeof BOARD_DATA !== 'undefined' && BOARD_DATA.PLAYERS) ? BOARD_DATA.PLAYERS[ownerColor.toUpperCase()] : null;
        if (!pData) return [];

        const path = [];
        if (auth.targetState === 'TRACK' && token.state === 'YARD') {
            const destTrack = (auth.trackIndex !== undefined && auth.trackIndex >= 0) ? auth.trackIndex : pData.startIndex;
            path.push({
                state: 'TRACK',
                stepCount: 0,
                trackIndex: destTrack,
                coord: BOARD_DATA.TRACK[destTrack]
            });
            return path;
        }

        const startStep = (token.state === 'TRACK' || token.state === 'HOME_STRETCH') ? (token.stepCount || 0) : 0;
        const targetStep = auth.targetStepCount || 0;

        if (startStep < targetStep) {
            for (let s = startStep + 1; s <= targetStep; s++) {
                if (s < 51) {
                    const trackIdx = (pData.startIndex + s) % 52;
                    path.push({
                        state: 'TRACK',
                        stepCount: s,
                        trackIndex: trackIdx,
                        coord: BOARD_DATA.TRACK[trackIdx]
                    });
                } else if (s >= 51 && s < 56) {
                    path.push({
                        state: 'HOME_STRETCH',
                        stepCount: s,
                        trackIndex: -1,
                        coord: pData.homeStretch[s - 51]
                    });
                } else if (s === 56) {
                    path.push({
                        state: 'FINISHED',
                        stepCount: 56,
                        trackIndex: -1,
                        coord: pData.centerGoal
                    });
                }
            }
        } else {
            // Direct destination fallback to ensure token reaches the exact authoritative cell
            let destCoord = null;
            if (auth.targetState === 'TRACK' && auth.trackIndex !== undefined && auth.trackIndex >= 0) {
                destCoord = BOARD_DATA.TRACK[auth.trackIndex];
            } else if (auth.targetState === 'HOME_STRETCH' && targetStep >= 51 && targetStep < 56) {
                destCoord = pData.homeStretch[targetStep - 51];
            } else if (auth.targetState === 'FINISHED') {
                destCoord = pData.centerGoal;
            }
            if (destCoord) {
                path.push({
                    state: auth.targetState,
                    stepCount: targetStep,
                    trackIndex: auth.trackIndex,
                    coord: destCoord
                });
            }
        }
        return path;
    }

    executeMove(tokenId, fromRemote = false, moverColor = null, authoritativeData = null) {
        if (moverColor && this.engine && this.engine.players) {
            const moverIdx = this.engine.players.findIndex(p => p.id === moverColor);
            if (moverIdx !== -1 && this.engine.currentTurnIndex !== moverIdx) {
                this.engine.currentTurnIndex = moverIdx;
            }
        }

        const player = (moverColor && this.engine && this.engine.players) ? (this.engine.players.find(p => p.id === moverColor) || this.engine.getCurrentPlayer()) : this.engine.getCurrentPlayer();
        const effectiveColor = moverColor || player.id;

        // Idempotency check: prevent duplicate execution of the exact same turn move
        const curTurnSeq = window.networkManager?.currentTurnSeq || 0;
        const curDice = this.engine?.diceValue || 0;
        const moveKey = `${effectiveColor}_${tokenId}_${curDice}_${curTurnSeq}`;
        if (this._lastExecutedMoveKey === moveKey && !fromRemote) {
            console.log(`[executeMove] Move ${moveKey} already executed, dropping duplicate.`);
            return;
        }

        if (this.animatingTokens) {
            if (fromRemote || (this._animStartTime && (Date.now() - this._animStartTime > 1800))) {
                // Remote authoritative moves override prior animation state to prevent desync
                this.animatingTokens = false;
            } else {
                return;
            }
        }

        // If not from remote and engine state is no longer SELECTING_TOKEN, reject duplicate/race moves
        if (!fromRemote && this.engine.state !== 'SELECTING_TOKEN') {
            console.log(`[executeMove] Engine is not in SELECTING_TOKEN (${this.engine.state}). Ignoring move attempt.`);
            return;
        }

        this._lastExecutedMoveKey = moveKey;

        if (window.networkManager && window.networkManager.isOnlineMatch) {
            window.networkManager.clearTurnTimers();
            if (!fromRemote) {
                const curPlayer = this.engine.getCurrentPlayer();
                if (curPlayer.id === window.networkManager.myColor) {
                    window.networkManager.moveToken(tokenId);
                }
            }
        }

        this._animStartTime = Date.now();
        this.stopTurnTimer();

        let token = player.tokens.find(t => t.id === tokenId);
        if (!token && this.engine.players) {
            for (const p of this.engine.players) {
                token = p.tokens.find(t => t.id === tokenId);
                if (token) break;
            }
        }

        // Fast-path: If remote authoritative move arrives and token is already at target destination,
        // do not re-hop; just reconcile board state cleanly
        if (fromRemote && authoritativeData && token) {
            if (token.state === authoritativeData.targetState && 
                token.stepCount === authoritativeData.targetStepCount && 
                token.trackIndex === authoritativeData.trackIndex) {
                console.log(`[executeMove] Token ${tokenId} already at destination, reconciling state without re-hop`);
                this.finalizeMove(tokenId, fromRemote, moverColor, authoritativeData);
                return;
            }
        }

        let path = null;
        if (authoritativeData && token) {
            path = this.buildAuthoritativePath(token, authoritativeData);
        } else {
            path = this.engine.calculateTokenPath(tokenId);
        }

        if (!path || path.length === 0 || !token) {
            this.finalizeMove(tokenId, fromRemote, moverColor, authoritativeData);
            return;
        }

        this.animatingTokens = true;
        let stepIdx = 0;
        let currentFromPos = this.getTokenPixelPos(token);

        const animateSingleStep = () => {
            if (stepIdx < path.length) {
                const nextStep = path[stepIdx];
                const fromPos = { ...currentFromPos };

                // Set token state to destination to compute destination coordinates (including stacking offsets)
                token.state = nextStep.state;
                token.stepCount = nextStep.stepCount;
                token.trackIndex = nextStep.trackIndex;

                const toPos = this.getTokenPixelPos(token);
                currentFromPos = { ...toPos }; // Base for subsequent hop

                window.soundFX.playStepTick();

                // Parabolic multi-frame hop interpolation (135ms per cell)
                const startTime = performance.now();
                const stepDuration = 135;

                const stepLoop = (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / stepDuration);
                    
                    // Parabolic arc for hop elevation
                    const arc = Math.sin(progress * Math.PI);
                    const maxHopElevation = this.cellSize * 0.40;
                    const hopElevation = arc * maxHopElevation;

                    // Compute hop offset oriented straight UP relative to screen regardless of board rotation
                    const angle = this.getBoardRotationAngle();
                    const hopDx = -hopElevation * Math.sin(angle);
                    const hopDy = -hopElevation * Math.cos(angle);

                    const curHopPos = {
                        x: fromPos.x + (toPos.x - fromPos.x) * progress + hopDx,
                        y: fromPos.y + (toPos.y - fromPos.y) * progress + hopDy,
                        scale: fromPos.scale + (toPos.scale - fromPos.scale) * progress,
                        hopOffset: hopElevation
                    };

                    this.render(token.id, progress, curHopPos);

                    if (progress < 1) {
                        requestAnimationFrame(stepLoop);
                    } else {
                        stepIdx++;
                        setTimeout(animateSingleStep, 15); // tiny landing rest
                    }
                };

                requestAnimationFrame(stepLoop);
            } else {
                this.animatingTokens = false;
                this.render(); // final rest render
                this.finalizeMove(tokenId, fromRemote, moverColor, authoritativeData);
            }
        };

        animateSingleStep();
    }

    finalizeMove(tokenId, fromRemote = false, moverColor = null, authoritativeData = null) {
        this.stopTurnTimer();
        const isOnline = !!(window.networkManager && window.networkManager.isOnlineMatch);
        const player = (moverColor && this.engine && this.engine.players) ? (this.engine.players.find(p => p.id === moverColor) || this.engine.getCurrentPlayer()) : this.engine.getCurrentPlayer();
        let movedToken = player.tokens.find(t => t.id === tokenId);
        if (!movedToken && this.engine.players) {
            for (const p of this.engine.players) {
                movedToken = p.tokens.find(t => t.id === tokenId);
                if (movedToken) break;
            }
        }
        const tokenPos = movedToken ? this.getTokenPixelPos(movedToken) : null;

        const moveRes = this.engine.moveToken(tokenId, 0, isOnline, authoritativeData);
        if (!moveRes) return;

        // Authoritative Full Board State Self-Healing Reconciliation
        if (authoritativeData && Array.isArray(authoritativeData.boardSnapshot) && this.engine && this.engine.players) {
            authoritativeData.boardSnapshot.forEach(savedP => {
                const liveP = this.engine.players.find(p => p.id === savedP.id);
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
        }

        window.soundFX.playMove();
        window.soundFX.vibrate(25);

        if (moveRes.cutOccurred) {
            window.soundFX.playCut();
            window.soundFX.vibrate([100, 50, 120]);
            window.soundFX.speakBengali('ঘুঁটি কাটা গেলো!');
            if (tokenPos && this.canvas) {
                const rect = this.canvas.getBoundingClientRect();
                const angle = this.getBoardRotationAngle();
                let screenX = tokenPos.x;
                let screenY = tokenPos.y;
                if (angle !== 0) {
                    const cx = this.boardSize / 2;
                    const cy = this.boardSize / 2;
                    const dx = tokenPos.x - cx;
                    const dy = tokenPos.y - cy;
                    screenX = cx + (dx * Math.cos(angle) - dy * Math.sin(angle));
                    screenY = cy + (dx * Math.sin(angle) + dy * Math.cos(angle));
                }
                const scaleX = this.boardSize > 0 ? (rect.width / this.boardSize) : 1;
                const scaleY = this.boardSize > 0 ? (rect.height / this.boardSize) : 1;
                this.showCaptureFX(rect.left + screenX * scaleX, rect.top + screenY * scaleY);
            } else {
                this.showCaptureFX();
            }
            this.setBannerText('💥 ঘুঁটি কাটা হয়েছে!', '+১ বোনাস চাল পেয়েছেন!');
        } else if (moveRes.tokenFinished) {
            window.soundFX.playSafe();
            window.soundFX.vibrate([80, 40, 80, 40, 150]);
            window.soundFX.speakBengali('পাকা ঘুঁটি!');
            this.showHomeReachFX();
            this.setBannerText('🏆 ঘুঁটি ঘরে পৌঁছেছে!', '+১ বোনাস চাল পেয়েছেন!');
        } else if (movedToken && movedToken.state === 'TRACK' && BOARD_DATA.isSafeIndex(movedToken.trackIndex)) {
            // Safe Star Landing
            window.soundFX.playSafe();
            window.soundFX.vibrate(40);
            this.setBannerText('⭐ নিরাপদ ঘরে পৌঁছেছে!', 'ঘুঁটি এখন নিরাপদ!');
        } else if (moveRes.bonusTurn) {
            this.setBannerText('🎲 বোনাস চাল!', '+১ অতিরিক্ত চাল দেওয়া হয়েছে');
        }

        this.updatePlayerPods();
        this.render();

        if (moveRes.gameOver) {
            window.soundFX.playVictory();
            window.soundFX.vibrate([100, 50, 100, 50, 250]);
            window.soundFX.speakBengali('অভিনন্দন! আপনি জিতেছেন!');
            this.showVictory(moveRes.winners);
            return;
        }

        // Online Multiplayer Turn Coordination
        if (isOnline) {
            window.networkManager.clearTurnTimers();
            if (moveRes.bonusTurn) {
                const curPlayer = this.engine.getCurrentPlayer();
                const isBot = (window.networkManager.botColors && window.networkManager.botColors.includes(curPlayer.id));
                const isMyTurn = (curPlayer.id === window.networkManager.myColor);

                if (isBot) {
                    window.networkManager.currentTurnSeq++;
                    window.networkManager.startStageADiceRoll(curPlayer.id, window.networkManager.currentTurnSeq);
                    setTimeout(() => {
                        window.networkManager.executeDeterministicBotTurn(curPlayer.id);
                    }, 800);
                } else if (isMyTurn) {
                    this.setBannerText('🎲 বোনাস চাল!', 'আবার ডাইসে চাপ দিন (১৫ সেকেন্ড)');
                    window.networkManager.startStageADiceRoll(curPlayer.id, ++window.networkManager.currentTurnSeq);
                } else {
                    this.setBannerText('🎲 বোনাস চাল!', `প্রতিপক্ষ (${curPlayer.id.toUpperCase()}) আবার চালবে...`);
                    window.networkManager.startStageADiceRoll(curPlayer.id, ++window.networkManager.currentTurnSeq);
                }
            } else {
                const isMyTurn = (window.networkManager && window.networkManager.myColor === player.id);
                const isBot = (window.networkManager && window.networkManager.botColors && window.networkManager.botColors.includes(player.id));
                if (!fromRemote || isBot) {
                    window.networkManager.passTurnToNext(player.id);
                } else {
                    // Remote player safety timeout: If remote peer does not pass turn within 1500ms after move animation finishes,
                    // advance deterministically on all clients so the board never hangs!
                    setTimeout(() => {
                        if (window.networkManager && window.networkManager.isOnlineMatch && window.networkManager.currentTurnColor === player.id) {
                            console.log(`[Turn Fallback] Remote player ${player.id} finished animation but did not pass turn. Advancing turn...`);
                            window.networkManager.passTurnToNext(player.id);
                        }
                    }, 1500);
                }
            }

            // Flush any queued turn change that arrived while animating
            if (this.pendingTurnColor) {
                const nextC = this.pendingTurnColor;
                this.pendingTurnColor = null;
                window.networkManager.handleTurnChanged(nextC);
            }
            return;
        }

        this.checkAITurn();
    }

    checkAITurn() {
        if (this.engine.state === 'GAME_OVER') {
            this.stopTurnTimer();
            return;
        }

        // In Real Online Mode: Disable local bot completely!
        if (window.networkManager && window.networkManager.isOnlineMatch) {
            this.updatePlayerPods();
            this.render();
            return;
        }

        // Always sync all corner player pods immediately to the active player
        this.updatePlayerPods();
        this.render();

        const player = this.engine.getCurrentPlayer();

        // Clear any previous bot timeouts
        if (this.aiTurnTimeout) {
            clearTimeout(this.aiTurnTimeout);
            this.aiTurnTimeout = null;
        }
        if (this.aiMoveTimeout) {
            clearTimeout(this.aiMoveTimeout);
            this.aiMoveTimeout = null;
        }
        if (this.aiWatchdogTimeout) {
            clearTimeout(this.aiWatchdogTimeout);
            this.aiWatchdogTimeout = null;
        }

        if (player.type === 'ai' || this.autoPlay) {
            this.setBannerText(`${player.name} (রোবট)`, 'ডাইস চাল দিচ্ছে...');

            // Emergency Watchdog: If bot ever remains stuck for > 3.5s, auto-recover cleanly
            this.aiWatchdogTimeout = setTimeout(() => {
                if (this.engine.state !== 'GAME_OVER' && (player.type === 'ai' || this.autoPlay)) {
                    console.warn(`[AI Watchdog] Recovering stuck turn for bot ${player.id}`);
                    this.recoverStuckBotTurn(player);
                }
            }, 3500);

            // Snappy reaction delay: 200ms
            this.aiTurnTimeout = setTimeout(() => {
                // If token hop animation is still running from previous move, retry briefly
                if (this.animatingTokens) {
                    this.aiTurnTimeout = setTimeout(() => this.checkAITurn(), 150);
                    return;
                }

                if (this.engine.state !== 'WAITING_ROLL') {
                    if (this.engine.state === 'SELECTING_TOKEN') {
                        this.executeBotMoveSelection(player);
                    } else {
                        this.engine.passTurn();
                        this.checkAITurn();
                    }
                    return;
                }

                window.soundFX.playDiceRoll();
                const cornerDiceBox = document.getElementById(`dice_box_${player.id}`);
                const cornerCube = document.getElementById(`cube_${player.id}`);
                const scene = cornerCube?.closest('.dice-3d-scene');

                if (cornerDiceBox) cornerDiceBox.classList.add('rolling');
                if (scene) scene.classList.add('rolling-shake');
                if (cornerCube) cornerCube.className = `dice-3d-cube tumble-roll dice-skin-${this.inventory?.equippedDice || 'classic'}`;

                // Fast 260ms 3D tumble
                this.aiTurnTimeout = setTimeout(() => {
                    if (cornerDiceBox) cornerDiceBox.classList.remove('rolling');
                    if (scene) scene.classList.remove('rolling-shake');

                    const rollRes = this.engine.rollDice();
                    if (!rollRes) {
                        // Roll returned null, never freeze! Pass turn cleanly
                        console.warn('[AI] rollDice returned null, passing turn');
                        this.engine.passTurn();
                        this.checkAITurn();
                        return;
                    }

                    this.updateDiceUI(rollRes.dice);
                    if (rollRes.dice === 6) {
                        window.soundFX.speakBengali('রোবটের ছক্কা!');
                    }
                    if (rollRes.threeSixesCanceled) {
                        window.soundFX.speakBengali('চাল বাতিল!');
                    }

                    this.setBannerText(`${player.name} চাল দিয়েছে: 🎲 ${rollRes.dice}`, rollRes.noMoves ? 'কোনো চাল নেই, টার্ন পাস হচ্ছে' : 'ঘুঁটি চালছে...');

                    if (rollRes.threeSixesCanceled || rollRes.noMoves) {
                        this.updatePlayerPods();
                        this.render();
                        this.aiTurnTimeout = setTimeout(() => {
                            this.engine.passTurn();
                            this.updatePlayerPods();
                            this.render();
                            this.checkAITurn();
                        }, 350);
                        return;
                    }

                    // Snappy bot move decision: 180ms
                    this.aiMoveTimeout = setTimeout(() => {
                        this.executeBotMoveSelection(player);
                    }, 180);
                }, 260);
            }, 200);
        } else {
            // Human turn (Manual)
            this.setBannerText(`${player.name}-এর চাল`, 'ডাইসে ট্যাপ করে চাল দিন');
        }
    }

    executeBotMoveSelection(player) {
        if (this.aiWatchdogTimeout) {
            clearTimeout(this.aiWatchdogTimeout);
            this.aiWatchdogTimeout = null;
        }
        if (this.animatingTokens) {
            this.aiMoveTimeout = setTimeout(() => this.executeBotMoveSelection(player), 150);
            return;
        }
        const bestTokenId = (typeof LudoAI !== 'undefined') ? LudoAI.chooseBestMove(this.engine, this.botDifficulty) : null;
        if (bestTokenId !== null && bestTokenId !== undefined) {
            this.executeMove(bestTokenId);
        } else {
            this.engine.passTurn();
            this.updatePlayerPods();
            this.render();
            this.checkAITurn();
        }
    }

    recoverStuckBotTurn(player) {
        if (this.animatingTokens) {
            this.animatingTokens = false;
        }
        if (this.engine.state === 'WAITING_ROLL') {
            const rollRes = this.engine.rollDice();
            if (!rollRes || rollRes.noMoves || rollRes.threeSixesCanceled) {
                this.engine.passTurn();
                this.checkAITurn();
            } else {
                this.executeBotMoveSelection(player);
            }
        } else if (this.engine.state === 'SELECTING_TOKEN') {
            this.executeBotMoveSelection(player);
        } else {
            this.engine.passTurn();
            this.checkAITurn();
        }
    }

    handleCanvasClick(e) {
        if (!e) return;
        const player = this.engine.getCurrentPlayer();
        const rect = this.canvas.getBoundingClientRect();
        
        // Multi-touch / mouse coordinate extraction
        let rawX = (e.clientX !== undefined) ? e.clientX : 0;
        let rawY = (e.clientY !== undefined) ? e.clientY : 0;
        if (e.changedTouches && e.changedTouches.length > 0) {
            rawX = e.changedTouches[0].clientX;
            rawY = e.changedTouches[0].clientY;
        } else if (e.touches && e.touches.length > 0) {
            rawX = e.touches[0].clientX;
            rawY = e.touches[0].clientY;
        }

        // Exact canvas coordinate mapping:
        // this.boardSize is the logical coordinate dimension (0..this.boardSize).
        // rect.width is the CSS pixel width of the canvas element on the screen.
        const scaleX = rect.width > 0 ? (this.boardSize / rect.width) : 1;
        const scaleY = rect.height > 0 ? (this.boardSize / rect.height) : 1;
        const visualX = (rawX - rect.left) * scaleX;
        const visualY = (rawY - rect.top) * scaleY;

        // Inverse rotation transformation: map visual click on rotated board to canonical board coordinates
        const angle = this.getBoardRotationAngle();
        let clickX = visualX;
        let clickY = visualY;
        if (angle !== 0) {
            const cx = this.boardSize / 2;
            const cy = this.boardSize / 2;
            const dx = visualX - cx;
            const dy = visualY - cy;
            const cos = Math.cos(-angle);
            const sin = Math.sin(-angle);
            clickX = cx + (dx * cos - dy * sin);
            clickY = cy + (dx * sin + dy * cos);
        }

        // 1. Check if user clicked on their personal Yard Dice to Roll
        if (player.type === 'human' && this.engine.state === 'WAITING_ROLL') {
            if (window.networkManager && window.networkManager.isOnlineMatch) {
                const isBot = window.networkManager.botColors && window.networkManager.botColors.includes(player.id);
                if (isBot) return;
            }
            const pData = BOARD_DATA.PLAYERS[player.id.toUpperCase()];
            if (pData && pData.diceCenter) {
                const dcx = (pData.diceCenter.col + 0.5) * this.cellSize;
                const dcy = (pData.diceCenter.row + 0.5) * this.cellSize;
                const distToDice = Math.hypot(clickX - dcx, clickY - dcy);
                if (distToDice <= this.cellSize * 2.0) {
                    this.executeRoll();
                    return;
                }
            }
        }

        if (player.type !== 'human' || this.engine.state !== 'SELECTING_TOKEN') return;

        // In Real Online Mode: Only the local player can touch tokens during their turn
        if (window.networkManager && window.networkManager.isOnlineMatch) {
            if (player.id !== window.networkManager.myColor) {
                window.networkManager.showToast('এখন আপনার চাল নয়!');
                return;
            }
            const isBot = window.networkManager.botColors && window.networkManager.botColors.includes(player.id);
            if (isBot) {
                console.log('[handleCanvasClick] Player is in bot mode. Ignoring manual touch.');
                return;
            }
        }

        // 2. Direct Token Hit-Box Check (Priority 1 - Strict & Accurate Finger Hitbox)
        let selectedToken = null;
        let minDist = Infinity;

        // Check tokens on TRACK and HOME_STRETCH first so track tokens near yards are never blocked
        for (let move of this.engine.validMoves) {
            const token = move.token;
            if (token.state !== 'YARD') {
                const pos = this.getTokenPixelPos(token);
                const dist = Math.hypot(clickX - pos.x, clickY - pos.y);
                if (dist <= this.cellSize * 1.35 && dist < minDist) {
                    minDist = dist;
                    selectedToken = token;
                }
            }
        }

        // If no track token was tapped, check tokens in YARD
        if (!selectedToken) {
            for (let move of this.engine.validMoves) {
                const token = move.token;
                if (token.state === 'YARD') {
                    const pos = this.getTokenPixelPos(token);
                    const dist = Math.hypot(clickX - pos.x, clickY - pos.y);
                    if (dist <= this.cellSize * 1.35 && dist < minDist) {
                        minDist = dist;
                        selectedToken = token;
                    }
                }
            }
        }

        // 3. Yard Area Fallback (Priority 2 - Only if click was strictly inside yard box and no track token was near)
        if (!selectedToken) {
            const hasExitYard = this.engine.validMoves.find(m => m.type === 'EXIT_YARD');
            if (hasExitYard) {
                let isInsideYard = false;
                const cs = this.cellSize;
                // Strict yard boundaries: 0..5.8 cells (row 6 and col 6 are strictly track cells!)
                if (player.id === 'red' && clickX <= 5.8 * cs && clickY >= 9.2 * cs) isInsideYard = true;
                else if (player.id === 'green' && clickX <= 5.8 * cs && clickY <= 5.8 * cs) isInsideYard = true;
                else if (player.id === 'yellow' && clickX >= 9.2 * cs && clickY <= 5.8 * cs) isInsideYard = true;
                else if (player.id === 'blue' && clickX >= 9.2 * cs && clickY >= 9.2 * cs) isInsideYard = true;

                if (isInsideYard) {
                    // Find closest yard token to click location
                    let closestYardToken = hasExitYard.token;
                    let yardMinDist = Infinity;
                    this.engine.validMoves.forEach(m => {
                        if (m.type === 'EXIT_YARD') {
                            const yPos = this.getTokenPixelPos(m.token);
                            const d = Math.hypot(clickX - yPos.x, clickY - yPos.y);
                            if (d < yardMinDist) {
                                yardMinDist = d;
                                closestYardToken = m.token;
                            }
                        }
                    });
                    this.executeMove(closestYardToken.id);
                    return;
                }
            }
        }

        if (selectedToken) {
            this.executeMove(selectedToken.id);
        }
    }

    getTokenPixelPos(token, jumpingTokenId = null, hopProgress = 0) {
        if (!token) return { x: 0, y: 0, scale: 1.0, hopOffset: 0 };
        const pData = BOARD_DATA.PLAYERS[token.color.toUpperCase()];
        if (!pData) return { x: 0, y: 0, scale: 1.0, hopOffset: 0 };
        let base = { x: 0, y: 0 };

        if (token.state === 'FINISHED') {
            const cs = this.cellSize;
            const cx = 7.5 * cs;
            const cy = 7.5 * cs;
            const color = token.color ? token.color.toLowerCase() : 'red';
            const playerObj = this.engine.players.find(p => p.id === color);
            const finishedTokens = (playerObj?.tokens || []).filter(t => t.state === 'FINISHED');
            const totalFinished = Math.max(1, finishedTokens.length);
            let idx = finishedTokens.findIndex(t => t.id === token.id);
            if (idx === -1) idx = 0;

            let px = cx, py = cy, sc = 0.72;

            if (color === 'red') {
                if (totalFinished === 1) {
                    px = cx; py = cy + 0.82 * cs; sc = 0.72;
                } else if (totalFinished === 2) {
                    sc = 0.65;
                    px = (idx === 0) ? (cx - 0.28 * cs) : (cx + 0.28 * cs);
                    py = cy + 0.85 * cs;
                } else if (totalFinished === 3) {
                    sc = 0.56;
                    if (idx === 0) { px = cx; py = cy + 0.52 * cs; }
                    else if (idx === 1) { px = cx - 0.32 * cs; py = cy + 0.95 * cs; }
                    else { px = cx + 0.32 * cs; py = cy + 0.95 * cs; }
                } else {
                    sc = 0.50;
                    if (idx === 0) { px = cx - 0.22 * cs; py = cy + 0.56 * cs; }
                    else if (idx === 1) { px = cx + 0.22 * cs; py = cy + 0.56 * cs; }
                    else if (idx === 2) { px = cx - 0.36 * cs; py = cy + 0.98 * cs; }
                    else { px = cx + 0.36 * cs; py = cy + 0.98 * cs; }
                }
            } else if (color === 'yellow') {
                if (totalFinished === 1) {
                    px = cx; py = cy - 0.82 * cs; sc = 0.72;
                } else if (totalFinished === 2) {
                    sc = 0.65;
                    px = (idx === 0) ? (cx - 0.28 * cs) : (cx + 0.28 * cs);
                    py = cy - 0.85 * cs;
                } else if (totalFinished === 3) {
                    sc = 0.56;
                    if (idx === 0) { px = cx; py = cy - 0.52 * cs; }
                    else if (idx === 1) { px = cx - 0.32 * cs; py = cy - 0.95 * cs; }
                    else { px = cx + 0.32 * cs; py = cy - 0.95 * cs; }
                } else {
                    sc = 0.50;
                    if (idx === 0) { px = cx - 0.22 * cs; py = cy - 0.56 * cs; }
                    else if (idx === 1) { px = cx + 0.22 * cs; py = cy - 0.56 * cs; }
                    else if (idx === 2) { px = cx - 0.36 * cs; py = cy - 0.98 * cs; }
                    else { px = cx + 0.36 * cs; py = cy - 0.98 * cs; }
                }
            } else if (color === 'green') {
                if (totalFinished === 1) {
                    px = cx - 0.82 * cs; py = cy; sc = 0.72;
                } else if (totalFinished === 2) {
                    sc = 0.65;
                    px = cx - 0.85 * cs;
                    py = (idx === 0) ? (cy - 0.28 * cs) : (cy + 0.28 * cs);
                } else if (totalFinished === 3) {
                    sc = 0.56;
                    if (idx === 0) { px = cx - 0.52 * cs; py = cy; }
                    else if (idx === 1) { px = cx - 0.95 * cs; py = cy - 0.32 * cs; }
                    else { px = cx - 0.95 * cs; py = cy + 0.32 * cs; }
                } else {
                    sc = 0.50;
                    if (idx === 0) { px = cx - 0.56 * cs; py = cy - 0.22 * cs; }
                    else if (idx === 1) { px = cx - 0.56 * cs; py = cy + 0.22 * cs; }
                    else if (idx === 2) { px = cx - 0.98 * cs; py = cy - 0.36 * cs; }
                    else { px = cx - 0.98 * cs; py = cy + 0.36 * cs; }
                }
            } else if (color === 'blue') {
                if (totalFinished === 1) {
                    px = cx + 0.82 * cs; py = cy; sc = 0.72;
                } else if (totalFinished === 2) {
                    sc = 0.65;
                    px = cx + 0.85 * cs;
                    py = (idx === 0) ? (cy - 0.28 * cs) : (cy + 0.28 * cs);
                } else if (totalFinished === 3) {
                    sc = 0.56;
                    if (idx === 0) { px = cx + 0.52 * cs; py = cy; }
                    else if (idx === 1) { px = cx + 0.95 * cs; py = cy - 0.32 * cs; }
                    else { px = cx + 0.95 * cs; py = cy + 0.32 * cs; }
                } else {
                    sc = 0.50;
                    if (idx === 0) { px = cx + 0.56 * cs; py = cy - 0.22 * cs; }
                    else if (idx === 1) { px = cx + 0.56 * cs; py = cy + 0.22 * cs; }
                    else if (idx === 2) { px = cx + 0.98 * cs; py = cy - 0.36 * cs; }
                    else { px = cx + 0.98 * cs; py = cy + 0.36 * cs; }
                }
            }

            let hopElevation = 0;
            if (jumpingTokenId !== null && token.id === jumpingTokenId && token.color === this.engine.getCurrentPlayer().id) {
                const arc = Math.sin(Math.max(0, Math.min(1, hopProgress || 0.5)) * Math.PI);
                hopElevation = cs * (0.15 + arc * 0.35);
            }

            return { x: px, y: py - hopElevation, scale: sc, hopOffset: hopElevation };
        }

        if (token.state === 'YARD') {
            const coord = (pData.yardCoords && pData.yardCoords[token.id]) ? pData.yardCoords[token.id] : { col: 1, row: 1 };
            base = BOARD_DATA.gridToPixels(coord.col, coord.row, this.boardSize);
            return { x: base.x, y: base.y, scale: 1.0, hopOffset: 0 };
        } else if (token.state === 'TRACK') {
            const coord = (BOARD_DATA.TRACK && BOARD_DATA.TRACK[token.trackIndex]) ? BOARD_DATA.TRACK[token.trackIndex] : { col: 7, row: 7 };
            base = BOARD_DATA.gridToPixels(coord.col, coord.row, this.boardSize);
        } else {
            // HOME_STRETCH
            const stretchIdx = Math.max(0, Math.min(4, token.stepCount - 51)); // 0..4
            const coord = (pData.homeStretch && pData.homeStretch[stretchIdx]) ? pData.homeStretch[stretchIdx] : { col: 7, row: 7 };
            base = BOARD_DATA.gridToPixels(coord.col, coord.row, this.boardSize);
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

        // Realistic Sinusoidal Parabolic Hop Arc
        let hopElevation = 0;
        if (jumpingTokenId !== null && token.id === jumpingTokenId && token.color === this.engine.getCurrentPlayer().id) {
            const arc = Math.sin(Math.max(0, Math.min(1, hopProgress || 0.5)) * Math.PI);
            hopElevation = this.cellSize * (0.15 + arc * 0.35);
            offsetY -= hopElevation;
        }

        return {
            x: base.x + offsetX,
            y: base.y + offsetY,
            scale: scale,
            hopOffset: hopElevation
        };
    }

    updateDiceUI(val) {
        const curPlayer = this.engine ? this.engine.getCurrentPlayer() : null;
        if (!curPlayer || !val) return;

        curPlayer.lastDice = val;

        // 1. Update 3D Cube Rotation to display exact face (1 to 6) with bounce landing
        const cube = document.getElementById(`cube_${curPlayer.id}`);
        if (cube) {
            cube.classList.remove('tumble-roll', 'dice-bounce-land');
            cube.className = `dice-3d-cube show-${val} dice-skin-${this.inventory?.equippedDice || 'classic'}`;
        }

        const scene = cube?.closest('.dice-3d-scene');
        if (scene) {
            scene.classList.remove('scene-bounce-land');
            void scene.offsetWidth; // Force reflow
            scene.classList.add('scene-bounce-land');
        }

        // 2. Trigger container landing impact bounce on personal dice box
        const diceBox = document.getElementById(`dice_box_${curPlayer.id}`);
        if (diceBox) {
            diceBox.classList.remove('dice-land-impact');
            void diceBox.offsetWidth; // Force reflow
            diceBox.classList.add('dice-land-impact');
        }

        // 3. Update 2D dice face fallback
        const faceEl = document.getElementById(`dice_face_${curPlayer.id}`);
        if (faceEl) {
            faceEl.className = `dice-face val-${val}`;
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

    getLocalPlayerColor() {
        if (window.networkManager && window.networkManager.isOnlineMatch && window.networkManager.myColor) {
            return String(window.networkManager.myColor).toLowerCase();
        }
        return 'red';
    }

    getBoardRotationAngle() {
        const color = this.getLocalPlayerColor();
        switch (color) {
            case 'green':
                return 3 * Math.PI / 2; // 270 deg clockwise (puts Green yard at bottom-left)
            case 'yellow':
                return Math.PI;          // 180 deg clockwise (puts Yellow yard at bottom-left)
            case 'blue':
                return Math.PI / 2;      // 90 deg clockwise (puts Blue yard at bottom-left)
            case 'red':
            default:
                return 0;                // 0 deg (standard Red yard at bottom-left)
        }
    }

    applyPodPosition(pod, pos) {
        if (!pod) return;
        pod.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
        pod.classList.add(pos);
        switch (pos) {
            case 'top-left':
                pod.style.gridColumn = '1';
                pod.style.gridRow = '1';
                pod.style.justifySelf = 'start';
                break;
            case 'top-right':
                pod.style.gridColumn = '2';
                pod.style.gridRow = '1';
                pod.style.justifySelf = 'end';
                break;
            case 'bottom-left':
                pod.style.gridColumn = '1';
                pod.style.gridRow = '3';
                pod.style.justifySelf = 'start';
                break;
            case 'bottom-right':
                pod.style.gridColumn = '2';
                pod.style.gridRow = '3';
                pod.style.justifySelf = 'end';
                break;
        }
    }

    updatePodPositions() {
        const localColor = this.getLocalPlayerColor();
        const mapping = {
            red: { red: 'bottom-left', blue: 'bottom-right', yellow: 'top-right', green: 'top-left' },
            green: { green: 'bottom-left', red: 'bottom-right', blue: 'top-right', yellow: 'top-left' },
            yellow: { yellow: 'bottom-left', green: 'bottom-right', red: 'top-right', blue: 'top-left' },
            blue: { blue: 'bottom-left', yellow: 'bottom-right', green: 'top-right', red: 'top-left' }
        }[localColor] || { red: 'bottom-left', blue: 'bottom-right', yellow: 'top-right', green: 'top-left' };

        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const pod = document.getElementById(`corner_${color}`);
            if (pod && mapping[color]) {
                this.applyPodPosition(pod, mapping[color]);
            }
        });
    }

    updatePlayerPods() {
        this.updatePodPositions();
        const curPlayer = this.engine ? this.engine.getCurrentPlayer() : null;
        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const pod = document.getElementById(`corner_${color}`);
            const diceBox = document.getElementById(`dice_box_${color}`);
            const cube = document.getElementById(`cube_${color}`);
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
                    nameEl.textContent = pObj.name || ((color === 'blue' || color === 'green') ? 'Team A' : 'Team B');
                } else if (pObj.name) {
                    nameEl.textContent = pObj.name;
                }
            }

            const isActive = (curPlayer && curPlayer.id === color);

            // Keep diceBox always visible for all participants in the match so dice never vanishes
            if (diceBox) {
                diceBox.style.display = 'flex';
            }

            // Sync dice cube value: prioritize rolled value, then player's lastDice, then 6
            const displayVal = (isActive && this.engine.diceValue) ? this.engine.diceValue : (pObj.lastDice || 6);

            if (isActive) {
                pod.classList.add('active-turn');
                if (cube && !cube.classList.contains('tumble-roll')) {
                    cube.className = `dice-3d-cube show-${displayVal} dice-skin-${this.inventory?.equippedDice || 'classic'}`;
                }
            } else {
                pod.classList.remove('active-turn');
                if (cube && !cube.classList.contains('tumble-roll')) {
                    cube.className = `dice-3d-cube show-${displayVal} dice-skin-${this.inventory?.equippedDice || 'classic'}`;
                }
            }

            // Dynamic ROLL Hint Tag: Displays exclusively on the active player's corner dice
            let rollTag = diceBox?.querySelector('.roll-hint-tag');
            if (rollTag) {
                if (isActive && this.engine && this.engine.state === 'WAITING_ROLL') {
                    rollTag.style.display = 'block';
                    if (window.networkManager && window.networkManager.isOnlineMatch) {
                        const isMyTurn = (color === window.networkManager.myColor);
                        rollTag.textContent = isMyTurn ? 'আপনার চাল' : 'ROLL';
                        if (isMyTurn) rollTag.classList.add('pulse-active');
                        else rollTag.classList.remove('pulse-active');
                    } else {
                        rollTag.textContent = (pObj.type === 'human') ? 'চালুন' : 'ROLL';
                        if (pObj.type === 'human') rollTag.classList.add('pulse-active');
                        else rollTag.classList.remove('pulse-active');
                    }
                } else {
                    rollTag.style.display = 'none';
                    rollTag.classList.remove('pulse-active');
                }
            }

            // Ensure pips are rendered inside corner dice box fallback
            if (faceEl && faceEl.children.length < 9) {
                faceEl.innerHTML = `
                    <div class="pip p1"></div><div class="pip p2"></div><div class="pip p3"></div>
                    <div class="pip p4"></div><div class="pip p5"></div><div class="pip p6"></div>
                    <div class="pip p7"></div><div class="pip p8"></div><div class="pip p9"></div>
                `;
                faceEl.className = `dice-face val-${displayVal}`;
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

        if (!container) return;
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

        // Update Career Statistics & Online Economy Rewards
        let humanWon = false;
        if (window.networkManager && window.networkManager.isOnlineMatch) {
            const myCol = (window.networkManager.myColor || 'red').toLowerCase();
            humanWon = (winners && winners.length > 0 && winners[0].toLowerCase() === myCol);
            if (typeof window.networkManager.awardOnlineMatchPrizes === 'function') {
                window.networkManager.awardOnlineMatchPrizes(winners);
            }
        } else if (this.engine.mode === 'TEAM_2V2') {
            humanWon = (this.engine.winningTeam === 'B');
        } else {
            humanWon = (winners && winners.length > 0 && winners[0].toLowerCase() === 'red');
        }

        this.userStats.matchesPlayed = (this.userStats.matchesPlayed || 0) + 1;
        if (humanWon) {
            this.userStats.matchesWon = (this.userStats.matchesWon || 0) + 1;
            this.userStats.currentStreak = (this.userStats.currentStreak || 0) + 1;
            if (this.userStats.currentStreak > (this.userStats.highestStreak || 0)) {
                this.userStats.highestStreak = this.userStats.currentStreak;
            }
        } else {
            this.userStats.matchesLost = (this.userStats.matchesLost || 0) + 1;
            this.userStats.currentStreak = 0;
        }
        this.updateWalletUI();

        // Clear active online match session upon game completion
        if (window.networkManager) {
            window.networkManager.clearActiveMatchSession();
        }

        // Silent Cloud Save on Match Completion
        if (window.cloudSaveManager) {
            window.cloudSaveManager.syncNow(true);
        }

        // Record Match Outcome to Supabase Cloud
        if (window.supabaseClient) {
            window.supabaseClient.recordMatchResult({
                roomCode: (window.networkManager && window.networkManager.isOnlineMatch) ? window.networkManager.currentRoomCode : 'offline',
                mode: this.engine ? this.engine.mode : 'CLASSIC',
                winnerId: (winners && winners[0]) ? winners[0] : 'red',
                winnerName: winnerName,
                winnerColor: (winners && winners[0]) ? winners[0] : 'red',
                players: this.engine ? this.engine.players.map(p => ({ id: p.id, name: p.name, finished: p.finishedTokens })) : []
            });
        }

        // Show Post-Match AdMob Interstitial
        setTimeout(() => {
            if (window.adMobManager) {
                window.adMobManager.showInterstitialAd();
            }
        }, 1800);

        // Friendly rating prompt check (only after win and > 7 days since last prompt)
        if (humanWon) {
            const lastPrompt = parseInt(localStorage.getItem('lx_last_rate_prompt') || '0', 10);
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - lastPrompt > SEVEN_DAYS) {
                setTimeout(() => {
                    const rateModal = document.getElementById('modalRateGamePrompt');
                    if (rateModal && !document.querySelector('.modal-overlay.active:not(#modalVictory)')) {
                        rateModal.classList.add('active');
                    }
                }, 2200);
            }
        }
    }

    launchConfetti() {
        const cCanvas = document.getElementById('confettiCanvas');
        if (!cCanvas) return;
        const cCtx = cCanvas.getContext('2d');
        if (!cCtx) return;
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
    // CANVAS RENDERING ENGINE (CYBER NEON DARK MARBLE EDITION)
    // ==========================================
    renderBoardToCache() {
        if (!this.boardCacheCanvas) {
            this.boardCacheCanvas = document.createElement('canvas');
        }
        const dpr = window.devicePixelRatio || 1;
        const size = this.boardSize;
        const cell = this.cellSize;

        this.boardCacheCanvas.width = size * dpr;
        this.boardCacheCanvas.height = size * dpr;

        const cacheCtx = this.boardCacheCanvas.getContext('2d');
        cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
        cacheCtx.scale(dpr, dpr);
        cacheCtx.clearRect(0, 0, size, size);

        const savedCtx = this.ctx;
        this.ctx = cacheCtx;

        try {
            // ==========================================
            // 1. CLASSIC IVORY / WHITE BOARD THEME
            // ==========================================
            if (this.boardTheme === 'white') {
                this.ctx.save();
                const frameGrad = this.ctx.createLinearGradient(0, 0, size, size);
                frameGrad.addColorStop(0, '#f8fafc');
                frameGrad.addColorStop(0.5, '#e2e8f0');
                frameGrad.addColorStop(1, '#cbd5e1');
                this.ctx.fillStyle = frameGrad;
                this.ctx.fillRect(0, 0, size, size);

                // Clean Crisp White Inner Playing Field
                const boardInnerMargin = Math.max(2, cell * 0.05);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(boardInnerMargin, boardInnerMargin, size - boardInnerMargin * 2, size - boardInnerMargin * 2);

                // Perimeter Subtle Accent Border
                this.ctx.strokeStyle = '#94a3b8';
                this.ctx.lineWidth = 1.2;
                this.ctx.strokeRect(boardInnerMargin + 0.5, boardInnerMargin + 0.5, size - (boardInnerMargin + 0.5) * 2, size - (boardInnerMargin + 0.5) * 2);
                this.ctx.restore();

                // 2. 4 Classic Color Yards (Bases)
                this.drawYardWhite(0, 9, BOARD_DATA.PLAYERS.RED);       // Bottom-Left (Red)
                this.drawYardWhite(0, 0, BOARD_DATA.PLAYERS.GREEN);     // Top-Left (Green)
                this.drawYardWhite(9, 0, BOARD_DATA.PLAYERS.YELLOW);    // Top-Right (Yellow)
                this.drawYardWhite(9, 9, BOARD_DATA.PLAYERS.BLUE);      // Bottom-Right (Blue)

                // 3. Track Grid (Common 52 Tracks) with Clean White/Silver Tiles
                BOARD_DATA.TRACK.forEach((coord, idx) => {
                    this.drawTrackCellWhite(coord.col, coord.row, idx);
                });

                // 4. Draw 4 Home Stretches with Solid Player Colors
                this.drawHomeStretchWhite(BOARD_DATA.PLAYERS.RED);
                this.drawHomeStretchWhite(BOARD_DATA.PLAYERS.GREEN);
                this.drawHomeStretchWhite(BOARD_DATA.PLAYERS.YELLOW);
                this.drawHomeStretchWhite(BOARD_DATA.PLAYERS.BLUE);

                // 5. Draw Center Goal (Classic 4 Triangles with Golden Crown Badge)
                this.drawCenterGoalWhite();
                return;
            }

            // ==========================================
            // 2. DEFAULT CYBER NEON DARK MARBLE (UNTOUCHED)
            // ==========================================
            // 1. Board Outer High-Tech Slate Rim & Subtle Texture
            this.ctx.save();
            const frameGrad = this.ctx.createLinearGradient(0, 0, size, size);
            frameGrad.addColorStop(0, '#0a0f1d');
            frameGrad.addColorStop(0.5, '#040711');
            frameGrad.addColorStop(1, '#020409');
            this.ctx.fillStyle = frameGrad;
            this.ctx.fillRect(0, 0, size, size);

            // Dark Marble / Obsidian Playing Field (Subtle veining & ambient glow)
            const boardInnerMargin = Math.max(2, cell * 0.05);
            const innerGrad = this.ctx.createRadialGradient(
                size * 0.5, size * 0.5, size * 0.1,
                size * 0.5, size * 0.5, size * 0.75
            );
            innerGrad.addColorStop(0, '#0d1527');
            innerGrad.addColorStop(0.55, '#080d19');
            innerGrad.addColorStop(1, '#03060d');

            this.ctx.fillStyle = innerGrad;
            this.ctx.fillRect(boardInnerMargin, boardInnerMargin, size - boardInnerMargin * 2, size - boardInnerMargin * 2);

            // Faint organic marble veining lines
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
            this.ctx.lineWidth = 1.2;
            this.ctx.beginPath();
            this.ctx.moveTo(size * 0.1, size * 0.85);
            this.ctx.bezierCurveTo(size * 0.35, size * 0.6, size * 0.6, size * 0.8, size * 0.9, size * 0.15);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(size * 0.15, size * 0.2);
            this.ctx.bezierCurveTo(size * 0.45, size * 0.35, size * 0.7, size * 0.1, size * 0.85, size * 0.75);
            this.ctx.stroke();
            this.ctx.restore();

            // High-tech subtle cyan perimeter circuit border
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
            this.ctx.lineWidth = 1.2;
            this.ctx.strokeRect(boardInnerMargin + 0.5, boardInnerMargin + 0.5, size - (boardInnerMargin + 0.5) * 2, size - (boardInnerMargin + 0.5) * 2);
            this.ctx.restore();

            // 2. Draw 4 Yards (Bases) with Cyber-Deck Bevels & Neon Tubes
            this.drawYard(0, 9, BOARD_DATA.PLAYERS.RED);       // Bottom-Left (Red)
            this.drawYard(0, 0, BOARD_DATA.PLAYERS.GREEN);     // Top-Left (Green)
            this.drawYard(9, 0, BOARD_DATA.PLAYERS.YELLOW);    // Top-Right (Yellow)
            this.drawYard(9, 9, BOARD_DATA.PLAYERS.BLUE);      // Bottom-Right (Blue)

            // 3. Draw Track Grid (Common 52 Tracks) with Cyan/Dark Grid Lines
            BOARD_DATA.TRACK.forEach((coord, idx) => {
                this.drawTrackCell(coord.col, coord.row, idx);
            });

            // 4. Draw 4 Home Stretches with Neon Glowing Pathways
            this.drawHomeStretch(BOARD_DATA.PLAYERS.RED);
            this.drawHomeStretch(BOARD_DATA.PLAYERS.GREEN);
            this.drawHomeStretch(BOARD_DATA.PLAYERS.YELLOW);
            this.drawHomeStretch(BOARD_DATA.PLAYERS.BLUE);

            // 5. Draw Center Goal with Cyber Cross X & Neon Edges
            this.drawCenterGoal();
        } finally {
            this.ctx = savedCtx;
            this.boardCacheValid = true;
        }
    }

    render(jumpingTokenId = null, hopProgress = 0, hopPos = null) {
        if (!this.boardCacheValid || !this.boardCacheCanvas) {
            this.renderBoardToCache();
        }

        const ctx = this.ctx;
        const size = this.boardSize;

        ctx.clearRect(0, 0, size, size);

        const angle = this.getBoardRotationAngle();
        if (angle !== 0) {
            ctx.save();
            ctx.translate(size / 2, size / 2);
            ctx.rotate(angle);
            ctx.translate(-size / 2, -size / 2);
        }

        ctx.drawImage(this.boardCacheCanvas, 0, 0, size, size);

        // 6. Draw Tokens with Realistic Contact Shadows & Dynamic Arc Hops
        this.drawTokens(jumpingTokenId, hopProgress, hopPos);

        if (angle !== 0) {
            ctx.restore();
        }
    }

    drawYard(startCol, startRow, pData) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = startCol * cell;
        const y = startRow * cell;
        const w = 6 * cell;
        const h = 6 * cell;

        // Color mapping for Cyber theme
        let neonColor = '#38bdf8';
        let darkTint = '#0c1b33';
        if (pData.id === 'green') { neonColor = '#22c55e'; darkTint = '#0a2316'; }
        else if (pData.id === 'yellow') { neonColor = '#facc15'; darkTint = '#2a2206'; }
        else if (pData.id === 'red') { neonColor = '#ef4444'; darkTint = '#280c10'; }
        else if (pData.id === 'blue') { neonColor = '#38bdf8'; darkTint = '#081e35'; }

        // 1. High-Tech Pod Exterior Chamfered Metal Chassis
        ctx.save();
        const margin = cell * 0.35;
        const podX = x + margin;
        const podY = y + margin;
        const podW = w - margin * 2;
        const podH = h - margin * 2;
        const cornerR = cell * 0.65;

        // Outer ambient drop-shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;

        // Beveled Chassis Metal Gradient (Graphite Titanium)
        const chassisGrad = ctx.createLinearGradient(podX, podY, podX + podW, podY + podH);
        chassisGrad.addColorStop(0, '#334155');
        chassisGrad.addColorStop(0.3, '#1e293b');
        chassisGrad.addColorStop(0.7, '#0f172a');
        chassisGrad.addColorStop(1, '#020617');

        ctx.fillStyle = chassisGrad;
        ctx.beginPath();
        ctx.roundRect(podX, podY, podW, podH, cornerR);
        ctx.fill();
        ctx.restore();

        // High-tech vent grills / industrial notches along the 4 edges
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1.5;
        const midX = podX + podW / 2;
        const midY = podY + podH / 2;
        [-1, 0, 1].forEach(offset => {
            // Top vent
            ctx.beginPath();
            ctx.moveTo(midX + offset * 6 - 8, podY + 2);
            ctx.lineTo(midX + offset * 6 - 8, podY + cell * 0.28);
            ctx.stroke();
            // Bottom vent
            ctx.beginPath();
            ctx.moveTo(midX + offset * 6 - 8, podY + podH - cell * 0.28);
            ctx.lineTo(midX + offset * 6 - 8, podY + podH - 2);
            ctx.stroke();
            // Left vent
            ctx.beginPath();
            ctx.moveTo(podX + 2, midY + offset * 6 - 8);
            ctx.lineTo(podX + cell * 0.28, midY + offset * 6 - 8);
            ctx.stroke();
            // Right vent
            ctx.beginPath();
            ctx.moveTo(podX + podW - cell * 0.28, midY + offset * 6 - 8);
            ctx.lineTo(podX + podW - 2, midY + offset * 6 - 8);
            ctx.stroke();
        });
        ctx.restore();

        // 2. High-Tech Vibrant Neon Glow Ring (The signature square light tube from image)
        ctx.save();
        const tubeInset = cell * 0.55;
        const tubeX = podX + tubeInset;
        const tubeY = podY + tubeInset;
        const tubeW = podW - tubeInset * 2;
        const tubeH = podH - tubeInset * 2;
        const tubeR = cell * 0.45;

        // Outer neon aura glow
        ctx.shadowColor = neonColor;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.roundRect(tubeX, tubeY, tubeW, tubeH, tubeR);
        ctx.stroke();

        // Inner intense white core of the neon light
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();

        // 3. Central Recessed Metal Pedestal Stage
        ctx.save();
        const stageInset = cell * 0.82;
        const stageX = podX + stageInset;
        const stageY = podY + stageInset;
        const stageW = podW - stageInset * 2;
        const stageH = podH - stageInset * 2;
        const stageR = cell * 0.35;

        const stageGrad = ctx.createRadialGradient(
            stageX + stageW / 2, stageY + stageH / 2, 2,
            stageX + stageW / 2, stageY + stageH / 2, stageW * 0.7
        );
        stageGrad.addColorStop(0, '#1e293b');
        stageGrad.addColorStop(0.6, '#0f172a');
        stageGrad.addColorStop(1, '#020617');

        ctx.fillStyle = stageGrad;
        ctx.beginPath();
        ctx.roundRect(stageX, stageY, stageW, stageH, stageR);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // 4. 4 High-Tech Token Docking Ring Sockets (Neon Circle Pads)
        pData.yardCoords.forEach(pos => {
            const px = (pos.col + 0.5) * cell;
            const py = (pos.row + 0.5) * cell;
            const socketR = cell * 0.38;

            // Recessed dark well
            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, socketR, 0, Math.PI * 2);
            ctx.fillStyle = '#050914';
            ctx.fill();

            // High-tech glowing neon docking ring outline
            ctx.strokeStyle = neonColor;
            ctx.lineWidth = 1.8;
            ctx.shadowColor = neonColor;
            ctx.shadowBlur = 8;
            ctx.stroke();

            // Inner core ring
            ctx.beginPath();
            ctx.arc(px, py, socketR * 0.65, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        });
    }

    drawTrackCell(col, row, trackIdx) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = col * cell;
        const y = row * cell;

        // 1. Dark Obsidian Grid Tile Background with Subtle Tech Sheen
        const cellGrad = ctx.createLinearGradient(x, y, x + cell, y + cell);
        cellGrad.addColorStop(0, '#090f1d');
        cellGrad.addColorStop(0.5, '#060a15');
        cellGrad.addColorStop(1, '#040710');

        ctx.fillStyle = cellGrad;
        ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

        // 2. High-Tech Cyan Neon Grid Border Line (Signature look from user screenshot)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

        // Highlight player start cells with player neon glow
        let pNeon = null;
        if (trackIdx === 0) pNeon = '#ef4444';       // RED
        else if (trackIdx === 13) pNeon = '#22c55e'; // GREEN
        else if (trackIdx === 26) pNeon = '#facc15'; // YELLOW
        else if (trackIdx === 39) pNeon = '#38bdf8'; // BLUE

        if (pNeon) {
            ctx.save();
            ctx.strokeStyle = pNeon;
            ctx.lineWidth = 1.8;
            ctx.shadowColor = pNeon;
            ctx.shadowBlur = 6;
            ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);

            ctx.fillStyle = pNeon;
            ctx.globalAlpha = 0.12;
            ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
            ctx.restore();
        }

        // 3. Draw Safe Star on designated safe cells (Golden outlined glowing star)
        if (BOARD_DATA.isSafeIndex(trackIdx)) {
            this.drawStar(x + cell / 2, y + cell / 2, cell * 0.32, 5, cell * 0.16);
        }
    }

    drawHomeStretch(pData) {
        const ctx = this.ctx;
        const cell = this.cellSize;

        let neonColor = '#38bdf8';
        if (pData.id === 'green') neonColor = '#22c55e';
        else if (pData.id === 'yellow') neonColor = '#facc15';
        else if (pData.id === 'red') neonColor = '#ef4444';
        else if (pData.id === 'blue') neonColor = '#38bdf8';

        pData.homeStretch.forEach((coord, i) => {
            const x = coord.col * cell;
            const y = coord.row * cell;

            // Dark tile with neon colored tint
            ctx.save();
            ctx.fillStyle = '#060a16';
            ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

            // Subtle colored wash
            ctx.fillStyle = neonColor;
            ctx.globalAlpha = 0.16;
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            ctx.globalAlpha = 1.0;

            // Glowing neon borders for home pathway
            ctx.strokeStyle = neonColor;
            ctx.lineWidth = 1.4;
            ctx.shadowColor = neonColor;
            ctx.shadowBlur = 5;
            ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
            ctx.restore();

            // Progress chevron pointing toward center
            ctx.save();
            ctx.fillStyle = neonColor;
            ctx.shadowColor = neonColor;
            ctx.shadowBlur = 4;
            const cx = x + cell / 2;
            const cy = y + cell / 2;
            const arrowSize = cell * 0.16;

            ctx.beginPath();
            if (pData.id === 'red') { // Going UP
                ctx.moveTo(cx, cy - arrowSize);
                ctx.lineTo(cx + arrowSize, cy + arrowSize * 0.6);
                ctx.lineTo(cx - arrowSize, cy + arrowSize * 0.6);
            } else if (pData.id === 'green') { // Going RIGHT
                ctx.moveTo(cx + arrowSize, cy);
                ctx.lineTo(cx - arrowSize * 0.6, cy - arrowSize);
                ctx.lineTo(cx - arrowSize * 0.6, cy + arrowSize);
            } else if (pData.id === 'yellow') { // Going DOWN
                ctx.moveTo(cx, cy + arrowSize);
                ctx.lineTo(cx + arrowSize, cy - arrowSize * 0.6);
                ctx.lineTo(cx - arrowSize, cy - arrowSize * 0.6);
            } else { // Going LEFT (Blue)
                ctx.moveTo(cx - arrowSize, cy);
                ctx.lineTo(cx + arrowSize * 0.6, cy - arrowSize);
                ctx.lineTo(cx + arrowSize * 0.6, cy + arrowSize);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    }

    drawCenterGoal() {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = 6 * cell;
        const y = 6 * cell;
        const w = 3 * cell;
        const h = 3 * cell;
        const cx = 7.5 * cell;
        const cy = 7.5 * cell;

        // 1. Center Dark Marble Well
        ctx.save();
        ctx.fillStyle = '#060914';
        ctx.fillRect(x, y, w, h);

        // Subtle quadrant neon colors matching the user screenshot
        const drawSector = (pData, x1, y1, x2, y2) => {
            let nColor = '#38bdf8';
            if (pData.id === 'green') nColor = '#22c55e';
            else if (pData.id === 'yellow') nColor = '#facc15';
            else if (pData.id === 'red') nColor = '#ef4444';

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x1 * cell, y1 * cell);
            ctx.lineTo(x2 * cell, y2 * cell);
            ctx.closePath();
            ctx.fillStyle = nColor;
            ctx.globalAlpha = 0.12;
            ctx.fill();
            ctx.restore();
        };

        drawSector(BOARD_DATA.PLAYERS.GREEN, 6, 6, 6, 9);   // Left
        drawSector(BOARD_DATA.PLAYERS.YELLOW, 6, 6, 9, 6);  // Top
        drawSector(BOARD_DATA.PLAYERS.BLUE, 9, 6, 9, 9);    // Right
        drawSector(BOARD_DATA.PLAYERS.RED, 6, 9, 9, 9);     // Bottom

        // 2. Neon Diagonal Cross "X" dividing the central goal (as seen in screenshot)
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.8;

        // Top-Left to Bottom-Right Line
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();

        // Bottom-Left to Top-Right Line
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y);
        ctx.stroke();

        // Center Box Outer Neon Border
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();

        // Inner glowing cross highlight
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
        ctx.moveTo(x, y + h); ctx.lineTo(x + w, y);
        ctx.stroke();
        ctx.restore();
    }

    drawStar(cx, cy, outerRadius, points, innerRadius) {
        const ctx = this.ctx;
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / points;

        ctx.save();
        // High-tech subtle ambient neon gold glow
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 8;

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

        // Soft cyber-gold fill & crisp gold stroke
        ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
    }

    // ==========================================
    // CLASSIC IVORY / WHITE BOARD DRAWING METHODS
    // ==========================================
    drawYardWhite(startCol, startRow, pData) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = startCol * cell;
        const y = startRow * cell;
        const w = 6 * cell;
        const h = 6 * cell;

        // Rich classic colors for player bases
        let baseColor = '#ef4444';
        let lightColor = '#f87171';
        let darkBorder = '#b91c1c';
        let softPadTint = '#fee2e2';

        if (pData.id === 'green') {
            baseColor = '#10b981';
            lightColor = '#34d399';
            darkBorder = '#047857';
            softPadTint = '#dcfce7';
        } else if (pData.id === 'yellow') {
            baseColor = '#eab308';
            lightColor = '#fde047';
            darkBorder = '#a16207';
            softPadTint = '#fef9c3';
        } else if (pData.id === 'red') {
            baseColor = '#ef4444';
            lightColor = '#f87171';
            darkBorder = '#b91c1c';
            softPadTint = '#fee2e2';
        } else if (pData.id === 'blue') {
            baseColor = '#3b82f6';
            lightColor = '#60a5fa';
            darkBorder = '#1d4ed8';
            softPadTint = '#dbeafe';
        }

        // 1. Exterior Colored Pod Base
        ctx.save();
        const margin = cell * 0.35;
        const podX = x + margin;
        const podY = y + margin;
        const podW = w - margin * 2;
        const podH = h - margin * 2;
        const cornerR = cell * 0.65;

        // Subtle ambient shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;

        // Vibrant gradient base
        const yardGrad = ctx.createLinearGradient(podX, podY, podX + podW, podY + podH);
        yardGrad.addColorStop(0, lightColor);
        yardGrad.addColorStop(0.5, baseColor);
        yardGrad.addColorStop(1, darkBorder);

        ctx.fillStyle = yardGrad;
        ctx.beginPath();
        ctx.roundRect(podX, podY, podW, podH, cornerR);
        ctx.fill();
        ctx.restore();

        // Crisp border on yard base
        ctx.save();
        ctx.strokeStyle = darkBorder;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(podX, podY, podW, podH, cornerR);
        ctx.stroke();
        ctx.restore();

        // 2. Inner Pure White Pedestal / Stage
        ctx.save();
        const stageInset = cell * 0.72;
        const stageX = podX + stageInset;
        const stageY = podY + stageInset;
        const stageW = podW - stageInset * 2;
        const stageH = podH - stageInset * 2;
        const stageR = cell * 0.42;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(stageX, stageY, stageW, stageH, stageR);
        ctx.fill();

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();

        // 3. 4 Token Docking Sockets (Recessed Pads)
        pData.yardCoords.forEach(pos => {
            const px = (pos.col + 0.5) * cell;
            const py = (pos.row + 0.5) * cell;
            const socketR = cell * 0.38;

            ctx.save();
            // Outer socket pad filled with soft color tint
            ctx.beginPath();
            ctx.arc(px, py, socketR, 0, Math.PI * 2);
            ctx.fillStyle = softPadTint;
            ctx.fill();

            // Colored rim ring
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = 2.0;
            ctx.stroke();

            // Inner white gloss highlight ring
            ctx.beginPath();
            ctx.arc(px, py, socketR * 0.68, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        });
    }

    drawTrackCellWhite(col, row, trackIdx) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = col * cell;
        const y = row * cell;

        // 1. Pure White Tile Background
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

        // 2. Clean Grid Border
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.0;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        ctx.restore();

        // 3. Player Start Cells
        let pColor = null;
        let pWash = null;
        if (trackIdx === 0) { pColor = '#ef4444'; pWash = '#fee2e2'; }      // RED
        else if (trackIdx === 13) { pColor = '#10b981'; pWash = '#dcfce7'; } // GREEN
        else if (trackIdx === 26) { pColor = '#eab308'; pWash = '#fef9c3'; } // YELLOW
        else if (trackIdx === 39) { pColor = '#3b82f6'; pWash = '#dbeafe'; } // BLUE

        if (pColor && pWash) {
            ctx.save();
            ctx.fillStyle = pWash;
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);

            ctx.strokeStyle = pColor;
            ctx.lineWidth = 2.0;
            ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);

            // Subtle starting dot/arrow in player color
            ctx.beginPath();
            ctx.arc(x + cell / 2, y + cell / 2, cell * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = pColor;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }

        // 4. Safe Star (Safe cells: 0, 8, 13, 21, 26, 34, 39, 47)
        if (BOARD_DATA.isSafeIndex(trackIdx)) {
            this.drawStarWhite(x + cell / 2, y + cell / 2, cell * 0.32, 5, cell * 0.16);
        }
    }

    drawStarWhite(cx, cy, outerRadius, points, innerRadius) {
        const ctx = this.ctx;
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / points;

        ctx.save();
        ctx.shadowColor = 'rgba(217, 119, 6, 0.4)';
        ctx.shadowBlur = 5;

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

        // Rich golden gradient fill
        const starGrad = ctx.createLinearGradient(cx - outerRadius, cy - outerRadius, cx + outerRadius, cy + outerRadius);
        starGrad.addColorStop(0, '#fbbf24');
        starGrad.addColorStop(0.5, '#f59e0b');
        starGrad.addColorStop(1, '#d97706');

        ctx.fillStyle = starGrad;
        ctx.fill();

        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
    }

    drawHomeStretchWhite(pData) {
        const ctx = this.ctx;
        const cell = this.cellSize;

        let baseColor = '#ef4444';
        if (pData.id === 'green') baseColor = '#10b981';
        else if (pData.id === 'yellow') baseColor = '#eab308';
        else if (pData.id === 'red') baseColor = '#ef4444';
        else if (pData.id === 'blue') baseColor = '#3b82f6';

        pData.homeStretch.forEach((coord, i) => {
            const x = coord.col * cell;
            const y = coord.row * cell;

            ctx.save();
            // Solid rich player color background
            ctx.fillStyle = baseColor;
            ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

            // Clean white separator border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4;
            ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
            ctx.restore();

            // Pure white guide arrow pointing towards center
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 3;
            const cx = x + cell / 2;
            const cy = y + cell / 2;
            const arrowSize = cell * 0.18;

            ctx.beginPath();
            if (pData.id === 'red') { // Going UP
                ctx.moveTo(cx, cy - arrowSize);
                ctx.lineTo(cx + arrowSize, cy + arrowSize * 0.6);
                ctx.lineTo(cx - arrowSize, cy + arrowSize * 0.6);
            } else if (pData.id === 'green') { // Going RIGHT
                ctx.moveTo(cx + arrowSize, cy);
                ctx.lineTo(cx - arrowSize * 0.6, cy - arrowSize);
                ctx.lineTo(cx - arrowSize * 0.6, cy + arrowSize);
            } else if (pData.id === 'yellow') { // Going DOWN
                ctx.moveTo(cx, cy + arrowSize);
                ctx.lineTo(cx + arrowSize, cy - arrowSize * 0.6);
                ctx.lineTo(cx - arrowSize, cy - arrowSize * 0.6);
            } else { // Going LEFT (Blue)
                ctx.moveTo(cx - arrowSize, cy);
                ctx.lineTo(cx + arrowSize * 0.6, cy - arrowSize);
                ctx.lineTo(cx + arrowSize * 0.6, cy + arrowSize);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    }

    drawCenterGoalWhite() {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const x = 6 * cell;
        const y = 6 * cell;
        const w = 3 * cell;
        const h = 3 * cell;
        const cx = 7.5 * cell;
        const cy = 7.5 * cell;

        // 1. Draw 4 Classic Colored Triangles meeting in center
        const drawTriangle = (color, x1, y1, x2, y2) => {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x1 * cell, y1 * cell);
            ctx.lineTo(x2 * cell, y2 * cell);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        };

        drawTriangle('#10b981', 6, 6, 6, 9);  // Left (Green)
        drawTriangle('#eab308', 6, 6, 9, 6);  // Top (Yellow)
        drawTriangle('#3b82f6', 9, 6, 9, 9);  // Right (Blue)
        drawTriangle('#ef4444', 6, 9, 9, 9);  // Bottom (Red)

        // 2. Clean White Dividing Cross
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.4;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y);
        ctx.stroke();

        // Center Box Outer Border
        ctx.strokeRect(x, y, w, h);
        ctx.restore();

        // 3. Central Golden Victory Badge
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.52, 0, Math.PI * 2);
        const goldBadge = ctx.createRadialGradient(cx, cy, 2, cx, cy, cell * 0.52);
        goldBadge.addColorStop(0, '#fef08a');
        goldBadge.addColorStop(0.5, '#f59e0b');
        goldBadge.addColorStop(1, '#b45309');
        ctx.fillStyle = goldBadge;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Gleaming Crown symbol in center
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(cell * 0.48)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑', cx, cy - 1);
        ctx.restore();
    }

    drawTokens(jumpingTokenId = null, hopProgress = 0, hopPos = null) {
        const ctx = this.ctx;
        const cell = this.cellSize;
        const equippedSkin = this.inventory?.equippedToken || 'classic';

        this.engine.players.forEach(player => {
            player.tokens.forEach(token => {
                try {
                    const isJumping = (jumpingTokenId !== null && token.id === jumpingTokenId && player.id === this.engine.getCurrentPlayer().id);
                    const pos = (isJumping && hopPos) ? hopPos : this.getTokenPixelPos(token, jumpingTokenId, hopProgress);
                    const scale = pos.scale || 1.0;
                    const isValidMove = (token.state !== 'FINISHED') && this.engine.validMoves.some(m => m.token.id === token.id && player.id === this.engine.getCurrentPlayer().id);

                    // Dynamic Selection Ring (Pulsing Golden/Color Aura)
                    if (isValidMove && !this.animatingTokens) {
                        ctx.save();
                        const auraTime = Date.now() * 0.005;
                        const pulse = 0.5 + 0.5 * Math.sin(auraTime);
                        const ringR = cell * (0.44 + pulse * 0.06) * scale;

                        // Multi-layer glowing selection ring
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, ringR, 0, Math.PI * 2);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3.5;
                        ctx.shadowColor = player.colorHex;
                        ctx.shadowBlur = 16 + pulse * 8;
                        ctx.stroke();

                        // Outer faint pulsing halo
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, ringR + 3.5, 0, Math.PI * 2);
                        ctx.strokeStyle = player.colorHex;
                        ctx.lineWidth = 2;
                        ctx.globalAlpha = 0.6 + pulse * 0.4;
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Shield Halo (in Power Dice Mode)
                    if (token.hasShield) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, cell * 0.52 * scale, 0, Math.PI * 2);
                        ctx.strokeStyle = '#00d4ff';
                        ctx.lineWidth = 3.5;
                        ctx.shadowColor = '#00d4ff';
                        ctx.shadowBlur = 12;
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Render token with equipped skin shader
                    this.drawSingleToken(
                        ctx,
                        pos.x,
                        pos.y,
                        scale,
                        player.colorHex,
                        isJumping,
                        equippedSkin,
                        pos.hopOffset || 0,
                        cell
                    );

                    // Render Golden Crown on top of Finished Tokens
                    if (token.state === 'FINISHED') {
                        ctx.save();
                        ctx.translate(pos.x, pos.y);
                        const angle = this.getBoardRotationAngle();
                        if (angle !== 0) ctx.rotate(-angle);
                        ctx.font = `${Math.round(cell * 0.36 * scale)}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = '#facc15';
                        ctx.shadowBlur = 8;
                        ctx.fillText('👑', 0, -cell * 0.38 * scale);
                        ctx.restore();
                    }
                } catch (err) {
                    console.error('Error drawing token:', err);
                }
            });
        });
    }

    drawSingleToken(ctx, x, y, scale, playerColorHex, isJumping = false, skinType = 'classic', hopOffset = 0, cell = null) {
        if (!cell) cell = this.cellSize || 36;

        ctx.save();
        ctx.translate(x, y);
        const angle = this.getBoardRotationAngle();
        if (angle !== 0) {
            ctx.rotate(-angle);
        }
        ctx.scale(scale, scale);

        if (skinType === 'gold') {
            // ==========================================
            // ROYAL GOLD TOKEN SHADER
            // ==========================================
            // 1. Warm Amber Shadow
            ctx.save();
            const groundY = cell * 0.28 + (isJumping ? (hopOffset || cell * 0.28) : 0);
            ctx.beginPath();
            ctx.ellipse(0, groundY, cell * 0.28, cell * 0.12, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(40, 20, 5, 0.65)';
            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.restore();

            // 2. 24k Gold Pedestal
            ctx.save();
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 10;
            const footGrad = ctx.createLinearGradient(-cell * 0.26, cell * 0.16, cell * 0.26, cell * 0.16);
            footGrad.addColorStop(0, '#fffbeb');
            footGrad.addColorStop(0.2, '#fef08a');
            footGrad.addColorStop(0.5, '#eab308');
            footGrad.addColorStop(0.85, '#a16207');
            footGrad.addColorStop(1, '#451a03');

            ctx.beginPath();
            ctx.ellipse(0, cell * 0.16, cell * 0.27, cell * 0.14, 0, 0, Math.PI * 2);
            ctx.fillStyle = footGrad;
            ctx.fill();
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Gold rim highlight
            ctx.beginPath();
            ctx.ellipse(-cell * 0.08, cell * 0.14, cell * 0.15, cell * 0.06, -0.2, 0, Math.PI);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();

            // 3. Brushed Gold Body with Player Color Gem Inlay
            ctx.save();
            const bodyGrad = ctx.createLinearGradient(-cell * 0.16, 0, cell * 0.16, 0);
            bodyGrad.addColorStop(0, '#fffbeb');
            bodyGrad.addColorStop(0.22, '#fde047');
            bodyGrad.addColorStop(0.48, playerColorHex);
            bodyGrad.addColorStop(0.78, '#ca8a04');
            bodyGrad.addColorStop(1, '#713f12');

            ctx.beginPath();
            ctx.moveTo(-cell * 0.17, cell * 0.13);
            ctx.quadraticCurveTo(-cell * 0.07, -cell * 0.05, -cell * 0.13, -cell * 0.16);
            ctx.lineTo(cell * 0.13, -cell * 0.16);
            ctx.quadraticCurveTo(cell * 0.07, -cell * 0.05, cell * 0.17, cell * 0.13);
            ctx.closePath();
            ctx.fillStyle = bodyGrad;
            ctx.fill();
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 1.3;
            ctx.stroke();

            // Golden ornamental filigree band
            ctx.beginPath();
            ctx.ellipse(0, -cell * 0.02, cell * 0.11, cell * 0.035, 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#fffbeb';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();

            // 4. Gold Collar Ring
            ctx.save();
            const collarGrad = ctx.createLinearGradient(-cell * 0.15, -cell * 0.16, cell * 0.15, -cell * 0.16);
            collarGrad.addColorStop(0, '#fffbeb');
            collarGrad.addColorStop(0.35, '#fde047');
            collarGrad.addColorStop(0.7, '#ca8a04');
            collarGrad.addColorStop(1, '#713f12');

            ctx.beginPath();
            ctx.ellipse(0, -cell * 0.16, cell * 0.15, cell * 0.07, 0, 0, Math.PI * 2);
            ctx.fillStyle = collarGrad;
            ctx.fill();
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            // 5. Gold Head Sphere with Royal Crown Emblem
            const headRadius = cell * 0.22;
            const headY = -cell * 0.31;
            const headGrad = ctx.createRadialGradient(
                -headRadius * 0.35, headY - headRadius * 0.35, headRadius * 0.05,
                0, headY, headRadius
            );
            headGrad.addColorStop(0, '#ffffff');
            headGrad.addColorStop(0.25, '#fffbeb');
            headGrad.addColorStop(0.48, '#facc15');
            headGrad.addColorStop(0.78, playerColorHex);
            headGrad.addColorStop(1, '#451a03');

            ctx.save();
            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
            ctx.fillStyle = headGrad;
            ctx.fill();
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            // 3-Point Royal Mini Crown Emblem on Head
            ctx.save();
            ctx.beginPath();
            const cY = headY - headRadius * 0.2;
            const cW = headRadius * 0.52;
            const cH = headRadius * 0.36;
            ctx.moveTo(-cW, cY + cH);
            ctx.lineTo(-cW, cY);
            ctx.lineTo(-cW * 0.4, cY + cH * 0.4);
            ctx.lineTo(0, cY - cH * 0.35);
            ctx.lineTo(cW * 0.4, cY + cH * 0.4);
            ctx.lineTo(cW, cY);
            ctx.lineTo(cW, cY + cH);
            ctx.closePath();
            ctx.fillStyle = '#fef08a';
            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = 5;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.restore();

            // Golden Glaze Specular Dot
            ctx.beginPath();
            ctx.ellipse(-headRadius * 0.32, headY - headRadius * 0.32, headRadius * 0.36, headRadius * 0.16, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fill();

        } else if (skinType === 'crystal') {
            // ==========================================
            // ICY CRYSTAL TOKEN SHADER
            // ==========================================
            // 1. Cyan-Icy Refractive Shadow
            ctx.save();
            const groundY = cell * 0.28 + (isJumping ? (hopOffset || cell * 0.28) : 0);
            ctx.beginPath();
            ctx.ellipse(0, groundY, cell * 0.28, cell * 0.12, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(14, 165, 233, 0.35)';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.restore();

            // 2. Crystal Pedestal
            ctx.save();
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 12;
            const footGrad = ctx.createLinearGradient(-cell * 0.26, cell * 0.16, cell * 0.26, cell * 0.16);
            footGrad.addColorStop(0, '#ffffff');
            footGrad.addColorStop(0.2, '#bae6fd');
            footGrad.addColorStop(0.55, '#38bdf8');
            footGrad.addColorStop(0.85, '#0284c7');
            footGrad.addColorStop(1, '#0c4a6e');

            ctx.beginPath();
            ctx.ellipse(0, cell * 0.16, cell * 0.27, cell * 0.14, 0, 0, Math.PI * 2);
            ctx.fillStyle = footGrad;
            ctx.fill();
            ctx.strokeStyle = '#e0f2fe';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            ctx.restore();

            // 3. Prismatic Stem with Diamond Facet Lines
            ctx.save();
            const bodyGrad = ctx.createLinearGradient(-cell * 0.16, 0, cell * 0.16, 0);
            bodyGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            bodyGrad.addColorStop(0.2, 'rgba(186, 230, 253, 0.85)');
            bodyGrad.addColorStop(0.48, playerColorHex);
            bodyGrad.addColorStop(0.75, 'rgba(56, 189, 248, 0.8)');
            bodyGrad.addColorStop(1, 'rgba(12, 74, 110, 0.9)');

            ctx.beginPath();
            ctx.moveTo(-cell * 0.17, cell * 0.13);
            ctx.quadraticCurveTo(-cell * 0.07, -cell * 0.05, -cell * 0.13, -cell * 0.16);
            ctx.lineTo(cell * 0.13, -cell * 0.16);
            ctx.quadraticCurveTo(cell * 0.07, -cell * 0.05, cell * 0.17, cell * 0.13);
            ctx.closePath();
            ctx.fillStyle = bodyGrad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Vertical crystal reflection ridge
            ctx.beginPath();
            ctx.moveTo(0, cell * 0.12);
            ctx.lineTo(0, -cell * 0.15);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();

            // 4. Frosted Crystal Collar
            ctx.save();
            const collarGrad = ctx.createLinearGradient(-cell * 0.15, -cell * 0.16, cell * 0.15, -cell * 0.16);
            collarGrad.addColorStop(0, '#ffffff');
            collarGrad.addColorStop(0.4, '#bae6fd');
            collarGrad.addColorStop(0.8, '#0284c7');
            collarGrad.addColorStop(1, '#0c4a6e');

            ctx.beginPath();
            ctx.ellipse(0, -cell * 0.16, cell * 0.15, cell * 0.07, 0, 0, Math.PI * 2);
            ctx.fillStyle = collarGrad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // 5. Brilliant Crystal Sphere with Diamond Star Flare
            const headRadius = cell * 0.22;
            const headY = -cell * 0.31;
            const headGrad = ctx.createRadialGradient(
                -headRadius * 0.35, headY - headRadius * 0.35, headRadius * 0.05,
                0, headY, headRadius
            );
            headGrad.addColorStop(0, '#ffffff');
            headGrad.addColorStop(0.3, '#e0f2fe');
            headGrad.addColorStop(0.6, '#38bdf8');
            headGrad.addColorStop(0.85, playerColorHex);
            headGrad.addColorStop(1, '#0c4a6e');

            ctx.save();
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
            ctx.fillStyle = headGrad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // 4-Point Diamond Cross Star Flare
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 6;
            const sX = -headRadius * 0.28;
            const sY = headY - headRadius * 0.28;
            const sR = headRadius * 0.40;
            ctx.beginPath();
            ctx.moveTo(sX, sY - sR);
            ctx.quadraticCurveTo(sX, sY, sX + sR, sY);
            ctx.quadraticCurveTo(sX, sY, sX, sY + sR);
            ctx.quadraticCurveTo(sX, sY, sX - sR, sY);
            ctx.quadraticCurveTo(sX, sY, sX, sY - sR);
            ctx.fill();
            ctx.restore();

        } else if (skinType === 'neon') {
            // ==========================================
            // CYBER NEON TOKEN SHADER
            // ==========================================
            // 1. Neon Aura Contact Shadow
            ctx.save();
            const groundY = cell * 0.28 + (isJumping ? (hopOffset || cell * 0.28) : 0);
            ctx.beginPath();
            ctx.ellipse(0, groundY, cell * 0.29, cell * 0.12, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.restore();

            // 2. Obsidian Carbon Pedestal with High-Voltage Neon Ring
            ctx.save();
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 14;
            const footGrad = ctx.createLinearGradient(-cell * 0.26, cell * 0.16, cell * 0.26, cell * 0.16);
            footGrad.addColorStop(0, '#1e293b');
            footGrad.addColorStop(0.4, '#090d16');
            footGrad.addColorStop(1, '#020617');

            ctx.beginPath();
            ctx.ellipse(0, cell * 0.16, cell * 0.27, cell * 0.14, 0, 0, Math.PI * 2);
            ctx.fillStyle = footGrad;
            ctx.fill();
            ctx.strokeStyle = playerColorHex;
            ctx.lineWidth = 2.2;
            ctx.stroke();
            ctx.restore();

            // 3. Cyber Stealth Body with Glowing Laser Spine
            ctx.save();
            const bodyGrad = ctx.createLinearGradient(-cell * 0.16, 0, cell * 0.16, 0);
            bodyGrad.addColorStop(0, '#334155');
            bodyGrad.addColorStop(0.25, '#0f172a');
            bodyGrad.addColorStop(0.5, '#020617');
            bodyGrad.addColorStop(0.75, '#0f172a');
            bodyGrad.addColorStop(1, '#1e293b');

            ctx.beginPath();
            ctx.moveTo(-cell * 0.17, cell * 0.13);
            ctx.quadraticCurveTo(-cell * 0.07, -cell * 0.05, -cell * 0.13, -cell * 0.16);
            ctx.lineTo(cell * 0.13, -cell * 0.16);
            ctx.quadraticCurveTo(cell * 0.07, -cell * 0.05, cell * 0.17, cell * 0.13);
            ctx.closePath();
            ctx.fillStyle = bodyGrad;
            ctx.fill();
            ctx.strokeStyle = playerColorHex;
            ctx.lineWidth = 1.4;
            ctx.stroke();

            // Electric Vertical Neon Laser Channel
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 9;
            ctx.beginPath();
            ctx.moveTo(0, cell * 0.12);
            ctx.lineTo(0, -cell * 0.15);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            // 4. Neon Energy Collar Ring
            ctx.save();
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.ellipse(0, -cell * 0.16, cell * 0.15, cell * 0.07, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            // 5. Plasma Bioluminescent Orb & Energy Reticle
            const headRadius = cell * 0.22;
            const headY = -cell * 0.31;
            const headGrad = ctx.createRadialGradient(
                0, headY, headRadius * 0.08,
                0, headY, headRadius
            );
            headGrad.addColorStop(0, '#ffffff');
            headGrad.addColorStop(0.35, playerColorHex);
            headGrad.addColorStop(0.85, '#090d16');
            headGrad.addColorStop(1, '#020617');

            ctx.save();
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
            ctx.fillStyle = headGrad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            // Concentric Neon Energy Halo Ring
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, headY, headRadius * 0.58, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Center laser dot
            ctx.beginPath();
            ctx.arc(0, headY, headRadius * 0.2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.restore();

        } else {
            // ==========================================
            // 1. CLASSIC CHROME & GLASS (DEFAULT)
            // ==========================================
            ctx.save();
            if (isJumping) {
                const groundY = cell * 0.28 + (hopOffset || cell * 0.28);
                ctx.beginPath();
                ctx.ellipse(0, groundY, cell * 0.30, cell * 0.13, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 8;
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.ellipse(0, cell * 0.28, cell * 0.28, cell * 0.12, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 3;
                ctx.fill();
            }
            ctx.restore();

            // Base Pedestal
            ctx.save();
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 10;
            const footGrad = ctx.createLinearGradient(-cell * 0.26, cell * 0.16, cell * 0.26, cell * 0.16);
            footGrad.addColorStop(0, '#ffffff');
            footGrad.addColorStop(0.2, '#94a3b8');
            footGrad.addColorStop(0.5, '#475569');
            footGrad.addColorStop(0.85, '#1e293b');
            footGrad.addColorStop(1, '#0f172a');

            ctx.beginPath();
            ctx.ellipse(0, cell * 0.16, cell * 0.27, cell * 0.14, 0, 0, Math.PI * 2);
            ctx.fillStyle = footGrad;
            ctx.fill();
            ctx.strokeStyle = playerColorHex;
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Pedestal rim highlight arc
            ctx.beginPath();
            ctx.ellipse(-cell * 0.08, cell * 0.14, cell * 0.15, cell * 0.06, -0.2, 0, Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();

            // Pawn Stem / Body
            ctx.save();
            const bodyGrad = ctx.createLinearGradient(-cell * 0.16, 0, cell * 0.16, 0);
            bodyGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            bodyGrad.addColorStop(0.25, '#94a3b8');
            bodyGrad.addColorStop(0.5, playerColorHex);
            bodyGrad.addColorStop(0.78, '#334155');
            bodyGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');

            ctx.beginPath();
            ctx.moveTo(-cell * 0.17, cell * 0.13);
            ctx.quadraticCurveTo(-cell * 0.07, -cell * 0.05, -cell * 0.13, -cell * 0.16);
            ctx.lineTo(cell * 0.13, -cell * 0.16);
            ctx.quadraticCurveTo(cell * 0.07, -cell * 0.05, cell * 0.17, cell * 0.13);
            ctx.closePath();
            ctx.fillStyle = bodyGrad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();

            // Pawn Collar Ring
            ctx.save();
            const collarGrad = ctx.createLinearGradient(-cell * 0.15, -cell * 0.16, cell * 0.15, -cell * 0.16);
            collarGrad.addColorStop(0, '#ffffff');
            collarGrad.addColorStop(0.35, '#cbd5e1');
            collarGrad.addColorStop(0.7, '#64748b');
            collarGrad.addColorStop(1, '#1e293b');

            ctx.beginPath();
            ctx.ellipse(0, -cell * 0.16, cell * 0.15, cell * 0.07, 0, 0, Math.PI * 2);
            ctx.fillStyle = collarGrad;
            ctx.fill();
            ctx.strokeStyle = playerColorHex;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // Pawn Top Sphere
            const headRadius = cell * 0.22;
            const headY = -cell * 0.31;
            const headGrad = ctx.createRadialGradient(
                -headRadius * 0.35, headY - headRadius * 0.35, headRadius * 0.05,
                0, headY, headRadius
            );
            headGrad.addColorStop(0, '#ffffff');
            headGrad.addColorStop(0.28, '#f1f5f9');
            headGrad.addColorStop(0.55, '#94a3b8');
            headGrad.addColorStop(0.8, playerColorHex);
            headGrad.addColorStop(1, '#0f172a');

            ctx.save();
            ctx.shadowColor = playerColorHex;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
            ctx.fillStyle = headGrad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();

            // Specular Glaze Highlight & Lens Dot
            ctx.beginPath();
            ctx.ellipse(-headRadius * 0.32, headY - headRadius * 0.32, headRadius * 0.38, headRadius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();

            // Secondary soft rim bounce
            ctx.beginPath();
            ctx.ellipse(headRadius * 0.28, headY + headRadius * 0.28, headRadius * 0.22, headRadius * 0.09, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fill();
        }

        ctx.restore();
    }

    getAvatarSvg(key) {
        const avatars = {
            king: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e11d48'/><circle cx='50' cy='38' r='20' fill='%23fed7aa'/><path d='M25 85 C25 62 75 62 75 85 Z' fill='%231e3a8a'/><rect x='36' y='32' width='28' height='8' rx='4' fill='%23000'/><polygon points='42,20 50,12 58,20 54,28 46,28' fill='%23f59e0b'/><circle cx='50' cy='11' r='3' fill='%23fde047'/></svg>`,
            tiger: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23ea580c'/><circle cx='50' cy='52' r='32' fill='%23fed7aa'/><circle cx='30' cy='28' r='14' fill='%23c2410c'/><circle cx='70' cy='28' r='14' fill='%23c2410c'/><circle cx='50' cy='50' r='26' fill='%23f97316'/><ellipse cx='42' cy='46' rx='5' ry='4' fill='%23000'/><ellipse cx='58' cy='46' rx='5' ry='4' fill='%23000'/><polygon points='47,56 53,56 50,62' fill='%23000'/><path d='M36 34 L44 38 L38 42 Z M64 34 L56 38 L62 42 Z M50 28 L47 38 L53 38 Z' fill='%23000'/></svg>`,
            boy: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%230284c7'/><circle cx='50' cy='42' r='22' fill='%23fed7aa'/><path d='M30 36 C30 20 70 20 70 36 C64 34 50 32 30 36 Z' fill='%23451a03'/><path d='M28 88 C28 66 72 66 72 88 Z' fill='%230369a1'/><circle cx='43' cy='42' r='3' fill='%23000'/><circle cx='57' cy='42' r='3' fill='%23000'/><path d='M25 40 A28 28 0 0 1 75 40' fill='none' stroke='%23f43f5e' stroke-width='6'/><rect x='22' y='36' width='8' height='16' rx='4' fill='%23f43f5e'/><rect x='70' y='36' width='8' height='16' rx='4' fill='%23f43f5e'/></svg>`,
            girl: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23ec4899'/><circle cx='50' cy='44' r='22' fill='%23fed7aa'/><path d='M26 44 C24 22 76 22 74 44 C66 32 50 30 26 44 Z' fill='%23701a75'/><path d='M26 88 C26 68 74 68 74 88 Z' fill='%23be185d'/><circle cx='43' cy='45' r='3' fill='%23000'/><circle cx='57' cy='45' r='3' fill='%23000'/><path d='M46 54 Q50 58 54 54' fill='none' stroke='%23e11d48' stroke-width='2.5'/><circle cx='70' cy='32' r='6' fill='%2338bdf8'/></svg>`,
            ninja: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%231e293b'/><circle cx='50' cy='42' r='24' fill='%230f172a'/><rect x='32' y='36' width='36' height='14' rx='4' fill='%23fed7aa'/><circle cx='42' cy='42' r='4' fill='%23ef4444'/><circle cx='58' cy='42' r='4' fill='%23ef4444'/><path d='M28 88 C28 66 72 66 72 88 Z' fill='%230f172a'/><rect x='30' y='22' width='40' height='8' rx='4' fill='%23dc2626'/></svg>`,
            robot: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%230f766e'/><rect x='30' y='26' width='40' height='36' rx='8' fill='%2394a3b8' stroke='%23334155' stroke-width='2'/><rect x='36' y='34' width='28' height='12' rx='4' fill='%23000'/><circle cx='43' cy='40' r='3' fill='%2338bdf8'/><circle cx='57' cy='40' r='3' fill='%2338bdf8'/><line x1='50' y1='26' x2='50' y2='14' stroke='%23facc15' stroke-width='3'/><circle cx='50' cy='12' r='4' fill='%23ef4444'/><path d='M26 88 C26 68 74 68 74 88 Z' fill='%23475569'/></svg>`
        };
        return avatars[key] || avatars.king;
    }

    applyAvatar(key) {
        if (!key) key = 'king';
        this.userStats.avatar = key;
        localStorage.setItem('lx_avatar', key);
        const svg = this.getAvatarSvg(key);

        const userAvatarEl = document.getElementById('userAvatarImg');
        if (userAvatarEl) userAvatarEl.src = svg;

        const profileAvatarEl = document.getElementById('profileCurrentAvatar');
        if (profileAvatarEl) profileAvatarEl.src = svg;

        document.querySelectorAll('.avatar-pick-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.avatar === key);
        });
    }

    initDailyRewards() {
        const btnDailyRewards = document.getElementById('btnDailyRewards');
        const modalDailyRewards = document.getElementById('modalDailyRewards');
        const btnClaim = document.getElementById('btnClaimDailyReward');
        const streakDaysEl = document.getElementById('dailyStreakDays');
        const gridEl = document.getElementById('dailyCalendarGrid');
        const statusMsgEl = document.getElementById('dailyClaimStatusMsg');
        const badgeEl = document.getElementById('dailyRewardBadge');

        const schedule = [
            { day: 1, type: 'coins', amount: 500, label: '🪙 ৫০০ কয়েন', icon: '🪙' },
            { day: 2, type: 'coins', amount: 1000, label: '🪙 ১,০০০ কয়েন', icon: '🪙' },
            { day: 3, type: 'diamonds', amount: 10, label: '💎 ১০ ডায়মন্ড', icon: '💎' },
            { day: 4, type: 'coins', amount: 2500, label: '🪙 ২,৫০০ কয়েন', icon: '🪙' },
            { day: 5, type: 'diamonds', amount: 25, label: '💎 ২৫ ডায়মন্ড', icon: '💎' },
            { day: 6, type: 'coins', amount: 5000, label: '🪙 ৫,০০০ কয়েন', icon: '🪙' },
            { day: 7, type: 'grand', coins: 10000, diamonds: 50, label: '🪙 ১০,০০০ + 💎 ৫০ + 👑 ক্রাউন', icon: '👑' }
        ];

        const getTodayStr = () => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const getYesterdayStr = () => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const checkState = () => {
            const today = getTodayStr();
            const yesterday = getYesterdayStr();
            const lastClaim = localStorage.getItem('lx_daily_last_claim') || '';
            let streak = parseInt(localStorage.getItem('lx_daily_streak') || '1', 10);

            let isClaimedToday = (lastClaim === today);

            if (!isClaimedToday && lastClaim !== yesterday && lastClaim !== '') {
                streak = 1;
                localStorage.setItem('lx_daily_streak', '1');
            }

            return { today, lastClaim, streak, isClaimedToday };
        };

        const renderCalendar = () => {
            const { streak, isClaimedToday } = checkState();
            const currentDay = streak;

            if (streakDaysEl) streakDaysEl.textContent = `${streak} দিন`;

            if (badgeEl) {
                badgeEl.style.display = isClaimedToday ? 'none' : 'block';
            }

            if (btnClaim) {
                if (isClaimedToday) {
                    btnClaim.disabled = true;
                    btnClaim.textContent = '✔ আজকের রিওয়ার্ড সংগৃহীত (আগামীকাল আসুন)';
                    btnClaim.style.opacity = '0.65';
                    btnClaim.style.cursor = 'default';
                    btnClaim.classList.remove('gold-glow');
                    if (statusMsgEl) {
                        statusMsgEl.style.display = 'block';
                        const nextDay = (currentDay % 7) + 1;
                        statusMsgEl.textContent = `আগামীকাল দিন ${nextDay}-এর রিওয়ার্ড আনলক হবে! ⏰`;
                    }
                } else {
                    btnClaim.disabled = false;
                    btnClaim.textContent = `🎁 দিন ${currentDay}-এর রিওয়ার্ড সংগ্রহ করুন`;
                    btnClaim.style.opacity = '1';
                    btnClaim.style.cursor = 'pointer';
                    btnClaim.classList.add('gold-glow');
                    if (statusMsgEl) statusMsgEl.style.display = 'none';
                }
            }

            if (!gridEl) return;
            gridEl.innerHTML = '';

            schedule.forEach(item => {
                const card = document.createElement('div');
                const isPast = item.day < currentDay || (item.day === currentDay && isClaimedToday);
                const isCurrent = (item.day === currentDay && !isClaimedToday);

                if (item.day === 7) {
                    card.className = `daily-day-card grand-day7 ${isPast ? 'claimed' : (isCurrent ? 'current' : 'locked')}`;
                    card.innerHTML = `
                        <div class="grand-left">
                            <div class="grand-crown">👑</div>
                            <div class="grand-info">
                                <div class="grand-title">দিন ৭ — গ্র্যান্ড মেগা প্রাইজ!</div>
                                <div class="grand-sub">🪙 ১০,০০০ কয়েন + 💎 ৫০ ডায়মন্ড + 👑 ক্রাউন</div>
                            </div>
                        </div>
                        <div class="day-status">${isPast ? 'সংগৃহীত ✔' : (isCurrent ? 'দাবি করুন ✨' : 'লক 🔒')}</div>
                    `;
                } else {
                    card.className = `daily-day-card ${isPast ? 'claimed' : (isCurrent ? 'current' : 'locked')}`;
                    card.innerHTML = `
                        <span class="day-badge">দিন ${item.day}</span>
                        <div class="day-icon">${item.icon}</div>
                        <span class="day-amount">${item.label}</span>
                        <span class="day-status">${isPast ? 'সংগৃহীত ✔' : (isCurrent ? 'দাবি করুন ✨' : 'লক 🔒')}</span>
                    `;
                }

                gridEl.appendChild(card);
            });
        };

        if (btnDailyRewards && modalDailyRewards) {
            this.bindFastTap(btnDailyRewards, () => {
                window.soundFX.playClick();
                renderCalendar();
                modalDailyRewards.classList.add('active');
            });
        }

        if (btnClaim) {
            this.bindFastTap(btnClaim, () => {
                const { today, streak, isClaimedToday } = checkState();
                if (isClaimedToday) return;

                const currentDay = streak;
                const reward = schedule.find(s => s.day === currentDay) || schedule[0];

                if (reward.type === 'coins') {
                    this.addCoins(reward.amount);
                } else if (reward.type === 'diamonds') {
                    this.addDiamonds(reward.amount);
                } else if (reward.type === 'grand') {
                    this.addCoins(reward.coins);
                    this.addDiamonds(reward.diamonds);
                }

                localStorage.setItem('lx_daily_last_claim', today);
                
                const nextStreak = (currentDay >= 7) ? 1 : currentDay + 1;
                localStorage.setItem('lx_daily_streak', nextStreak);

                window.soundFX.playVictory();
                if (window.soundFX.playBengaliVoice) window.soundFX.playBengaliVoice('six');
                this.launchConfetti();

                renderCalendar();
                alert(`🎉 অভিনন্দন! আপনি দিন ${currentDay}-এর রিওয়ার্ড (${reward.label}) সফলভাবে পেয়েছেন!`);
            });
        }

        // Render badge and calendar state without auto-popup blocking the screen
        renderCalendar();
    }

    initLuckySpin() {
        const btnLuckySpin = document.getElementById('btnLuckySpin');
        const modalLuckySpin = document.getElementById('modalLuckySpin');
        const canvas = document.getElementById('luckySpinCanvas');
        const btnSpin = document.getElementById('btnSpinTheWheel');
        const resultBanner = document.getElementById('luckySpinResultBanner');
        const resultText = document.getElementById('luckySpinResultText');
        const timerNotice = document.getElementById('luckySpinTimerNotice');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const slices = [
            { label: '500 Coins', type: 'coins', amount: 500, color: '#f59e0b', icon: '🪙' },
            { label: '2 Gems', type: 'gems', amount: 2, color: '#8b5cf6', icon: '💎' },
            { label: '1,000 Coins', type: 'coins', amount: 1000, color: '#3b82f6', icon: '🪙' },
            { label: '1 Shield', type: 'shield', amount: 1, color: '#10b981', icon: '🛡️' },
            { label: '2,500 Coins', type: 'coins', amount: 2500, color: '#f97316', icon: '🪙' },
            { label: '5 Gems', type: 'gems', amount: 5, color: '#06b6d4', icon: '💎' },
            { label: '5,000 Coins', type: 'coins', amount: 5000, color: '#ec4899', icon: '🪙' },
            { label: '10 Gems', type: 'gems', amount: 10, color: '#eab308', icon: '💎' }
        ];
        const numSlices = slices.length;
        const sliceAngle = (2 * Math.PI) / numSlices;
        let currentAngle = 0;
        let isSpinning = false;
        let lastTickSlice = -1;

        const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        const formatCountdown = (ms) => {
            const totalSecs = Math.max(0, Math.floor(ms / 1000));
            const hours = Math.floor(totalSecs / 3600);
            const mins = Math.floor((totalSecs % 3600) / 60);
            const secs = totalSecs % 60;
            const pad = (n) => n.toString().padStart(2, '0');
            return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
        };

        const updateSpinCooldown = () => {
            if (isSpinning || !btnSpin) return;
            const lastSpinTime = parseInt(localStorage.getItem('lx_last_lucky_spin_time') || '0', 10);
            const now = Date.now();
            const remaining = COOLDOWN_MS - (now - lastSpinTime);

            if (remaining > 0) {
                btnSpin.disabled = true;
                btnSpin.style.opacity = '0.65';
                btnSpin.style.cursor = 'not-allowed';
                btnSpin.innerHTML = `⏳ পরবর্তী স্পিন: ${formatCountdown(remaining)}`;
                if (timerNotice) {
                    timerNotice.innerHTML = `⏰ দৈনিক ফ্রি স্পিন ব্যবহৃত হয়েছে। পরবর্তী স্পিন আনলক হতে <strong>${formatCountdown(remaining)}</strong> বাকি।`;
                    timerNotice.style.color = '#f87171';
                }
            } else {
                btnSpin.disabled = false;
                btnSpin.style.opacity = '1';
                btnSpin.style.cursor = 'pointer';
                btnSpin.innerHTML = `🎡 স্পিন করুন (FREE)`;
                if (timerNotice) {
                    timerNotice.innerHTML = `⏰ ২৪ ঘণ্টায় একবারই ফ্রি স্পিন করা যায়। এখনই চাকা ঘুরিয়ে পুরস্কার জিতে নিন!`;
                    timerNotice.style.color = '#fbbf24';
                }
            }
        };

        // Live countdown interval
        setInterval(updateSpinCooldown, 1000);
        updateSpinCooldown();

        const drawWheel = (angle) => {
            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const radius = cx - 12;

            ctx.clearRect(0, 0, w, h);

            // 1. Outer Metallic Golden Ring with Drop Shadow
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
            const outerGrad = ctx.createLinearGradient(0, 0, w, h);
            outerGrad.addColorStop(0, '#fef08a');
            outerGrad.addColorStop(0.3, '#d97706');
            outerGrad.addColorStop(0.7, '#fef08a');
            outerGrad.addColorStop(1, '#92400e');
            ctx.fillStyle = outerGrad;
            ctx.fill();
            ctx.restore();

            // Inner dark rim ring
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
            ctx.fillStyle = '#1e1b4b';
            ctx.fill();

            // 2. Draw Wheel Slices
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);

            for (let i = 0; i < numSlices; i++) {
                const sAngle = i * sliceAngle;
                const eAngle = sAngle + sliceAngle;
                const slice = slices[i];

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, radius, sAngle, eAngle);
                ctx.closePath();

                // Gradient fill for slice
                const sliceGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, radius);
                sliceGrad.addColorStop(0, '#ffffff');
                sliceGrad.addColorStop(0.18, slice.color);
                sliceGrad.addColorStop(1, '#0f172a');
                ctx.fillStyle = sliceGrad;
                ctx.fill();

                // Border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 1.8;
                ctx.stroke();

                // Slice Text & Icon
                ctx.save();
                ctx.rotate(sAngle + sliceAngle / 2);
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';

                // Icon
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText(slice.icon, radius - 14, 0);

                // Label
                ctx.font = 'bold 12px "Hind Siliguri", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 4;
                ctx.fillText(slice.label, radius - 40, 0);
                ctx.restore();
            }

            // Decorative gold pegs around outer rim
            const pegRadius = radius + 5;
            for (let i = 0; i < numSlices * 2; i++) {
                const pegAng = (i * Math.PI) / numSlices;
                const px = Math.cos(pegAng) * pegRadius;
                const py = Math.sin(pegAng) * pegRadius;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fillStyle = (i % 2 === 0) ? '#fef08a' : '#ffffff';
                ctx.shadowColor = '#fef08a';
                ctx.shadowBlur = 4;
                ctx.fill();
            }

            ctx.restore();

            // 3. Center Hub (Stationary)
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, 26, 0, Math.PI * 2);
            const hubGrad = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 26);
            hubGrad.addColorStop(0, '#ffffff');
            hubGrad.addColorStop(0.3, '#fef08a');
            hubGrad.addColorStop(0.7, '#d97706');
            hubGrad.addColorStop(1, '#78350f');
            ctx.fillStyle = hubGrad;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Center jewel/star
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⭐', cx, cy);
            ctx.restore();
        };

        // Initial draw
        drawWheel(currentAngle);

        if (btnLuckySpin && modalLuckySpin) {
            this.bindFastTap(btnLuckySpin, () => {
                window.soundFX.playClick();
                modalLuckySpin.classList.add('active');
                if (resultBanner) resultBanner.style.display = 'none';
                updateSpinCooldown();
                drawWheel(currentAngle);
            });
        }

        if (btnSpin) {
            this.bindFastTap(btnSpin, () => {
                if (isSpinning) return;

                const lastSpinTime = parseInt(localStorage.getItem('lx_last_lucky_spin_time') || '0', 10);
                const remaining = COOLDOWN_MS - (Date.now() - lastSpinTime);
                if (remaining > 0) {
                    alert(`⏳ ২৪ ঘণ্টার কুলডাউন চলছে! পরবর্তী স্পিনের জন্য ${formatCountdown(remaining)} অপেক্ষা করুন।`);
                    updateSpinCooldown();
                    return;
                }

                isSpinning = true;
                btnSpin.disabled = true;
                btnSpin.style.opacity = '0.6';
                if (resultBanner) resultBanner.style.display = 'none';

                window.soundFX.playClick();
                window.soundFX.playDiceRoll();

                const winningIdx = Math.floor(Math.random() * numSlices);
                const wonItem = slices[winningIdx];

                const totalRevolutions = 5 + Math.floor(Math.random() * 3);
                const targetSliceOffset = (3 * Math.PI / 2) - (winningIdx + 0.5) * sliceAngle;
                const startAngle = currentAngle;
                const deltaNorm = ((targetSliceOffset - (startAngle % (Math.PI * 2))) + Math.PI * 2) % (Math.PI * 2);
                const targetAngle = startAngle + (totalRevolutions * Math.PI * 2) + deltaNorm;

                const duration = 4000;
                const startTime = performance.now();
                const easeOut = (t) => 1 - Math.pow(1 - t, 3.2);

                const animate = (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / duration);
                    const eased = easeOut(progress);

                    currentAngle = startAngle + (targetAngle - startAngle) * eased;
                    drawWheel(currentAngle);

                    const pointerAngleInWheel = ((3 * Math.PI / 2 - currentAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                    const currentSlice = Math.floor(pointerAngleInWheel / sliceAngle);
                    if (currentSlice !== lastTickSlice) {
                        lastTickSlice = currentSlice;
                        window.soundFX.playStepTick();
                        window.soundFX.vibrate(12);
                    }

                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        isSpinning = false;
                        localStorage.setItem('lx_last_lucky_spin_time', Date.now().toString());
                        updateSpinCooldown();

                        window.soundFX.playClaimReward();
                        window.soundFX.vibrate(60);
                        this.launchConfetti();

                        let rewardMessage = '';
                        if (wonItem.type === 'coins') {
                            this.addCoins(wonItem.amount);
                            rewardMessage = `🎉 অভিনন্দন! আপনি জিতেছেন ${wonItem.amount.toLocaleString()} কয়েন!`;
                        } else if (wonItem.type === 'gems') {
                            this.addDiamonds(wonItem.amount);
                            rewardMessage = `💎 অভিনন্দন! আপনি জিতেছেন ${wonItem.amount}টি ডায়মন্ড!`;
                        } else if (wonItem.type === 'shield') {
                            this.addCoins(500);
                            rewardMessage = `🛡️ অভিনন্দন! আপনি পেয়েছেন ১টি শিল্ড (+৫০০ কয়েন)!`;
                        }

                        if (resultBanner && resultText) {
                            resultText.textContent = rewardMessage;
                            resultBanner.style.display = 'block';
                        }

                        window.soundFX.speakBengali(rewardMessage.replace(/🎉|💎|🛡️|!/g, ''));
                    }
                };

                requestAnimationFrame(animate);
            });
        }
    }

    initSnakeLadderGame() {
        const btnSnakeLadder = document.getElementById('btnSnakeLadder');
        const modalSnakeLadder = document.getElementById('modalSnakeLadder');
        const canvas = document.getElementById('snakeLadderCanvas');
        const btnRoll = document.getElementById('btnRollSnakeDice');
        const diceCubeEl = document.getElementById('snakeDiceCube');
        const btnRestart = document.getElementById('btnRestartSnakeGame');
        const p1PosEl = document.getElementById('snakeP1Pos');
        const p2PosEl = document.getElementById('snakeP2Pos');
        const statusBanner = document.getElementById('snakeStatusBanner');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Ladders: bottom -> top
        const ladders = {
            4: 14,
            9: 31,
            20: 38,
            28: 84,
            40: 59,
            63: 81,
            71: 91
        };

        // Snakes: head -> tail
        const snakes = {
            17: 7,
            54: 34,
            62: 19,
            64: 60,
            87: 24,
            93: 73,
            95: 75,
            99: 78
        };

        let playerPos = 1;
        let botPos = 1;
        let currentTurn = 'player'; // 'player' | 'bot'
        let isMoving = false;
        let isGameOver = false;

        const getSquareCoords = (sq) => {
            const rowFromBottom = Math.floor((sq - 1) / 10);
            const row = 9 - rowFromBottom;
            const col = (rowFromBottom % 2 === 0) ? (sq - 1) % 10 : 9 - ((sq - 1) % 10);
            const padding = 10;
            const cellSize = 32;
            return {
                x: padding + col * cellSize + cellSize / 2,
                y: padding + row * cellSize + cellSize / 2,
                left: padding + col * cellSize,
                top: padding + row * cellSize,
                size: cellSize
            };
        };

        const drawBoard = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // 1. Draw 10x10 Grid Tiles
            for (let sq = 1; sq <= 100; sq++) {
                const c = getSquareCoords(sq);
                const rowFromBottom = Math.floor((sq - 1) / 10);
                const col = (rowFromBottom % 2 === 0) ? (sq - 1) % 10 : 9 - ((sq - 1) % 10);
                const isEvenCell = (rowFromBottom + col) % 2 === 0;

                // Base color
                if (sq === 1) {
                    ctx.fillStyle = '#bbf7d0'; // Light emerald start
                } else if (sq === 100) {
                    ctx.fillStyle = '#fef08a'; // Golden victory square
                } else if (ladders[sq]) {
                    ctx.fillStyle = '#fed7aa'; // Ladder base soft orange
                } else if (snakes[sq]) {
                    ctx.fillStyle = '#fecdd3'; // Snake head soft pink/red
                } else {
                    ctx.fillStyle = isEvenCell ? '#ffffff' : '#f1f5f9';
                }

                ctx.fillRect(c.left, c.top, c.size, c.size);

                // Border
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 0.8;
                ctx.strokeRect(c.left, c.top, c.size, c.size);

                // Square Number
                ctx.font = 'bold 8.5px sans-serif';
                ctx.fillStyle = '#64748b';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(sq.toString(), c.left + 2, c.top + 2);

                if (sq === 1) {
                    ctx.font = 'bold 8px sans-serif';
                    ctx.fillStyle = '#15803d';
                    ctx.textAlign = 'center';
                    ctx.fillText('🏁 START', c.x, c.y + 4);
                } else if (sq === 100) {
                    ctx.font = 'bold 9px sans-serif';
                    ctx.fillStyle = '#b45309';
                    ctx.textAlign = 'center';
                    ctx.fillText('👑 WIN', c.x, c.y + 4);
                }
            }

            // 2. Draw Ladders
            Object.keys(ladders).forEach(bottomKey => {
                const bottomSq = parseInt(bottomKey, 10);
                const topSq = ladders[bottomSq];
                const b = getSquareCoords(bottomSq);
                const t = getSquareCoords(topSq);

                const dx = t.x - b.x;
                const dy = t.y - b.y;
                const dist = Math.hypot(dx, dy);
                if (dist === 0) return;

                const ux = dx / dist;
                const uy = dy / dist;
                const px = -uy;
                const py = ux;
                const halfW = 4.5;

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetY = 2;

                // Two golden rails
                ctx.strokeStyle = '#d97706';
                ctx.lineWidth = 2.4;
                ctx.lineCap = 'round';

                ctx.beginPath();
                ctx.moveTo(b.x + px * halfW, b.y + py * halfW);
                ctx.lineTo(t.x + px * halfW, t.y + py * halfW);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(b.x - px * halfW, b.y - py * halfW);
                ctx.lineTo(t.x - px * halfW, t.y - py * halfW);
                ctx.stroke();

                // Rungs
                const numRungs = Math.max(3, Math.floor(dist / 14));
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 1.8;
                for (let r = 1; r < numRungs; r++) {
                    const frac = r / numRungs;
                    const rx = b.x + dx * frac;
                    const ry = b.y + dy * frac;
                    ctx.beginPath();
                    ctx.moveTo(rx + px * halfW, ry + py * halfW);
                    ctx.lineTo(rx - px * halfW, ry - py * halfW);
                    ctx.stroke();
                }
                ctx.restore();
            });

            // 3. Draw Snakes
            Object.keys(snakes).forEach(headKey => {
                const headSq = parseInt(headKey, 10);
                const tailSq = snakes[headSq];
                const pHead = getSquareCoords(headSq);
                const pTail = getSquareCoords(tailSq);

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetY = 2;

                const midX = (pHead.x + pTail.x) / 2;
                const midY = (pHead.y + pTail.y) / 2;
                const dx = pTail.x - pHead.x;
                const dy = pTail.y - pHead.y;
                const nx = -dy * 0.22;
                const ny = dx * 0.22;

                // Snake body
                ctx.beginPath();
                ctx.moveTo(pHead.x, pHead.y);
                ctx.quadraticCurveTo(midX + nx, midY + ny, pTail.x, pTail.y);
                ctx.strokeStyle = '#15803d';
                ctx.lineWidth = 6.5;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Snake body center pattern
                ctx.strokeStyle = '#86efac';
                ctx.lineWidth = 2.2;
                ctx.stroke();

                // Snake Head
                ctx.beginPath();
                ctx.arc(pHead.x, pHead.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#166534';
                ctx.fill();
                ctx.strokeStyle = '#fef08a';
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Snake Eyes
                ctx.beginPath();
                ctx.arc(pHead.x - 2, pHead.y - 2, 1.2, 0, Math.PI * 2);
                ctx.arc(pHead.x + 2, pHead.y - 2, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                // Little red tongue
                ctx.beginPath();
                ctx.moveTo(pHead.x, pHead.y - 5);
                ctx.lineTo(pHead.x, pHead.y - 8);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.2;
                ctx.stroke();

                ctx.restore();
            });

            // 4. Draw Player & Bot Tokens
            const p1Coords = getSquareCoords(playerPos);
            const p2Coords = getSquareCoords(botPos);

            const isSameCell = (playerPos === botPos);
            const p1Offset = isSameCell ? -6 : 0;
            const p2Offset = isSameCell ? 6 : 0;

            // Player 1 (Red 🔴)
            ctx.save();
            ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p1Coords.x + p1Offset, p1Coords.y, 7, 0, Math.PI * 2);
            const p1Grad = ctx.createRadialGradient(
                p1Coords.x + p1Offset - 2, p1Coords.y - 2, 1,
                p1Coords.x + p1Offset, p1Coords.y, 7
            );
            p1Grad.addColorStop(0, '#fca5a5');
            p1Grad.addColorStop(0.4, '#ef4444');
            p1Grad.addColorStop(1, '#991b1b');
            ctx.fillStyle = p1Grad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // Player 2 (Robot 🤖 Yellow/Gold)
            ctx.save();
            ctx.shadowColor = 'rgba(234, 179, 8, 0.6)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p2Coords.x + p2Offset, p2Coords.y, 7, 0, Math.PI * 2);
            const p2Grad = ctx.createRadialGradient(
                p2Coords.x + p2Offset - 2, p2Coords.y - 2, 1,
                p2Coords.x + p2Offset, p2Coords.y, 7
            );
            p2Grad.addColorStop(0, '#fef08a');
            p2Grad.addColorStop(0.4, '#eab308');
            p2Grad.addColorStop(1, '#854d0e');
            ctx.fillStyle = p2Grad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Bot label dot
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(p2Coords.x + p2Offset, p2Coords.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        // Initial draw
        drawBoard();

        if (btnSnakeLadder && modalSnakeLadder) {
            this.bindFastTap(btnSnakeLadder, () => {
                window.soundFX.playClick();
                modalSnakeLadder.classList.add('active');
                drawBoard();
            });
        }

        const updateScores = () => {
            if (p1PosEl) p1PosEl.textContent = playerPos;
            if (p2PosEl) p2PosEl.textContent = botPos;
        };

        const executeHopMove = (isPlayer, roll, onComplete) => {
            let currentPos = isPlayer ? playerPos : botPos;
            const targetPos = currentPos + roll;

            // Cannot overshoot 100
            if (targetPos > 100) {
                window.soundFX.playTimerAlert();
                if (statusBanner) {
                    statusBanner.textContent = isPlayer 
                        ? `⚠️ চালটি বেশি হয়ে গেছে! জিততে ঠিক ${100 - currentPos} দরকার।`
                        : `🤖 রোবটের চাল ১০০ অতিক্রম করেছে!`;
                }
                setTimeout(() => {
                    onComplete(false);
                }, 900);
                return;
            }

            let hopsLeft = roll;
            const hopStep = () => {
                if (hopsLeft > 0) {
                    currentPos++;
                    if (isPlayer) playerPos = currentPos;
                    else botPos = currentPos;
                    hopsLeft--;
                    updateScores();
                    drawBoard();
                    window.soundFX.playStepTick();
                    window.soundFX.vibrate(15);
                    setTimeout(hopStep, 220);
                } else {
                    // Reached target square!
                    // 1. Check Win
                    if (currentPos === 100) {
                        isGameOver = true;
                        if (isPlayer) {
                            window.soundFX.playVictory();
                            this.launchConfetti();
                            this.addCoins(1000);
                            if (statusBanner) {
                                statusBanner.textContent = '🎉 অভিনন্দন! আপনি ১০০ ঘরে পৌঁছে বিজয়ী হয়েছেন! (+১,০০০ কয়েন)';
                            }
                            window.soundFX.speakBengali('অভিনন্দন! আপনি সাপ-লুডু জিতেছেন!');
                        } else {
                            window.soundFX.playTimerAlert();
                            if (statusBanner) {
                                statusBanner.textContent = '🤖 রোবট ১০০ ঘরে পৌঁছে ম্যাচ জিতে গেছে! আবার চেষ্টা করুন।';
                            }
                        }
                        if (btnRoll) btnRoll.disabled = true;
                        return;
                    }

                    // 2. Check Ladder
                    if (ladders[currentPos]) {
                        const ladderTop = ladders[currentPos];
                        setTimeout(() => {
                            window.soundFX.playPowerUp();
                            window.soundFX.vibrate(50);
                            if (isPlayer) {
                                playerPos = ladderTop;
                                if (statusBanner) statusBanner.textContent = `🪜 চমৎকার! মই পেয়ে ${ladderTop} ঘরে উঠলেন!`;
                            } else {
                                botPos = ladderTop;
                                if (statusBanner) statusBanner.textContent = `🤖 রোবট মই পেয়ে ${ladderTop} ঘরে উঠল!`;
                            }
                            updateScores();
                            drawBoard();
                            setTimeout(() => onComplete(true), 600);
                        }, 400);
                        return;
                    }

                    // 3. Check Snake
                    if (snakes[currentPos]) {
                        const snakeTail = snakes[currentPos];
                        setTimeout(() => {
                            window.soundFX.playCut();
                            window.soundFX.vibrate(80);
                            if (isPlayer) {
                                playerPos = snakeTail;
                                if (statusBanner) statusBanner.textContent = `🐍 হায় হায়! সাপে কেটে ${snakeTail} ঘরে নামিয়ে দিল!`;
                            } else {
                                botPos = snakeTail;
                                if (statusBanner) statusBanner.textContent = `🤖 সাপে কেটে রোবটকে ${snakeTail} ঘরে নামিয়ে দিল!`;
                            }
                            updateScores();
                            drawBoard();
                            setTimeout(() => onComplete(true), 600);
                        }, 400);
                        return;
                    }

                    onComplete(true);
                }
            };

            hopStep();
        };

        const triggerBotTurn = () => {
            if (isGameOver) return;
            currentTurn = 'bot';
            if (btnRoll) btnRoll.disabled = true;
            if (statusBanner) statusBanner.textContent = '🤖 রোবটের চাল... ডাইস ঘুরছে...';

            setTimeout(() => {
                window.soundFX.playDiceRoll();
                const roll = Math.floor(Math.random() * 6) + 1;
                if (diceCubeEl) diceCubeEl.textContent = `🤖 ${roll}`;

                executeHopMove(false, roll, (moved) => {
                    if (isGameOver) return;

                    if (roll === 6) {
                        if (statusBanner) statusBanner.textContent = '🤖 রোবট ৬ পেয়েছে! আবার রোবটের চাল...';
                        setTimeout(triggerBotTurn, 900);
                    } else {
                        currentTurn = 'player';
                        if (btnRoll) btnRoll.disabled = false;
                        if (statusBanner) statusBanner.textContent = '🎲 আপনার চাল - ডাইস রোল করুন!';
                    }
                });
            }, 900);
        };

        if (btnRoll) {
            this.bindFastTap(btnRoll, () => {
                if (isMoving || currentTurn !== 'player' || isGameOver) return;
                isMoving = true;
                btnRoll.disabled = true;

                window.soundFX.playClick();
                window.soundFX.playDiceRoll();

                // Roll dice 1-6
                const roll = Math.floor(Math.random() * 6) + 1;
                if (diceCubeEl) diceCubeEl.textContent = `🎲 ${roll}`;

                executeHopMove(true, roll, (moved) => {
                    isMoving = false;
                    if (isGameOver) return;

                    if (roll === 6) {
                        btnRoll.disabled = false;
                        if (statusBanner) statusBanner.textContent = '🎲 ৬ পড়েছে! আপনি আবার চাল পাবেন!';
                    } else {
                        triggerBotTurn();
                    }
                });
            });
        }

        if (btnRestart) {
            this.bindFastTap(btnRestart, () => {
                window.soundFX.playClick();
                playerPos = 1;
                botPos = 1;
                currentTurn = 'player';
                isMoving = false;
                isGameOver = false;
                updateScores();
                if (btnRoll) btnRoll.disabled = false;
                if (diceCubeEl) diceCubeEl.textContent = '🎲 6';
                if (statusBanner) statusBanner.textContent = '🎲 নতুন ম্যাচ শুরু! আপনার চাল - রোল করুন!';
                drawBoard();
            });
        }
    }
}

window.LudoUIController = LudoUIController;

window.addEventListener('DOMContentLoaded', () => {
    window.ludoApp = new LudoUIController();
    window.uiController = window.ludoApp;

    // Auto start support for deep-linking and headless testing
    try {
        const params = new URLSearchParams(window.location.search);
        const autostart = params.get('autostart');
        if (autostart === 'team_2v2') {
            setTimeout(() => {
                window.ludoApp.launchGameWithMode('TEAM_2V2', 'pass_play', 'TEAM 2v2 (CLASSIC)', 4);
            }, 300);
        } else if (autostart === 'classic') {
            setTimeout(() => {
                window.ludoApp.launchGameWithMode('CLASSIC', 'vs_ai', 'VS COMPUTER', 4);
            }, 300);
        }
    } catch (e) {
        console.warn('Auto start query param parse warning:', e);
    }
});
