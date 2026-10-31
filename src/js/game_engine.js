// Ludo X Core Game Engine & Rules State Machine

class LudoGameEngine {
    constructor(config = {}) {
        this.mode = config.mode || 'CLASSIC'; // 'CLASSIC' | 'QUICK_RUSH' | 'POWER_DICE' | 'TEAM_2V2'
        this.playerCount = config.playerCount || 4; // 2, 3, or 4
        this.playerTypes = config.playerTypes || { red: 'human', green: 'ai', yellow: 'ai', blue: 'ai' };
        this.playerNames = config.playerNames || {};
        this.friendlyKill = (config.friendlyKill === true);
        this.selectedColors = config.selectedColors || null;

        this.players = [];
        this.currentTurnIndex = 0;
        this.diceValue = 1;
        this.consecutiveSixes = 0;
        this.state = 'WAITING_ROLL'; // 'WAITING_ROLL', 'ROLLING', 'SELECTING_TOKEN', 'MOVING', 'GAME_OVER'
        this.validMoves = [];
        this.winners = [];
        this.turnTimer = null;

        // Power-ups inventory per player (for POWER_DICE mode)
        this.powerUps = {
            red: { shield: 1, reroll: 1, jump: 1 },
            green: { shield: 1, reroll: 1, jump: 1 },
            yellow: { shield: 1, reroll: 1, jump: 1 },
            blue: { shield: 1, reroll: 1, jump: 1 }
        };

        this.initGame();
    }

    isTeammate(colorA, colorB) {
        if (this.mode !== 'TEAM_2V2') return false;
        const teamA = ['blue', 'green'];
        const teamB = ['red', 'yellow'];
        return (teamA.includes(colorA) && teamA.includes(colorB)) || (teamB.includes(colorA) && teamB.includes(colorB));
    }

    initGame() {
        const allColors = ['red', 'green', 'yellow', 'blue'];
        let activeColors = allColors;

        if (this.playerCount === 2) {
            activeColors = this.selectedColors || ['red', 'yellow']; // Red vs Yellow for opposite diagonal 2-player match
        } else if (this.playerCount === 3) {
            activeColors = this.selectedColors || ['red', 'green', 'yellow'];
        }

        const tokensPerPlayer = (this.mode === 'QUICK_RUSH') ? 2 : 4;

        this.players = activeColors.map(colorKey => {
            const data = BOARD_DATA.PLAYERS[colorKey.toUpperCase()];
            const tokens = [];
            for (let i = 0; i < tokensPerPlayer; i++) {
                tokens.push({
                    id: i,
                    color: colorKey,
                    state: 'YARD', // 'YARD', 'TRACK', 'HOME_STRETCH', 'FINISHED'
                    trackIndex: -1, // 0..51
                    stepCount: 0,   // 0 to 56 (51 on track + 5 home stretch + 1 finish)
                    hasShield: false,
                    homeStretchRolls: 0
                });
            }

            const customName = this.playerNames[colorKey] || data.name;

            return {
                id: colorKey,
                name: customName,
                colorHex: data.colorHex,
                type: this.playerTypes[colorKey] || 'ai',
                tokens: tokens,
                finishedTokens: 0,
                rank: null,
                rollsWithoutSix: 0, // Track rolls without getting a 6
                captureAttempts: 0, // Track rolls with cutting opportunity
                cutPlan: [] // Opponent Token Cut Plan
            };
        });

        this.currentTurnIndex = 0;
        this.consecutiveSixes = 0;
        this.state = 'WAITING_ROLL';
        this.winners = [];
        this.validMoves = [];
    }

    getCurrentPlayer() {
        return this.players[this.currentTurnIndex];
    }

    /**
     * Determines which dice roll values (1..6) would allow the player to land on
     * and capture an unprotected opponent token on the common track.
     * @param {Object} player 
     * @returns {number[]} Array of unique dice values (e.g. [2, 5]) that achieve a cut.
     */
    /**
     * Determines which dice roll values (1..6) would allow the player to land on
     * and capture an unprotected opponent token on the common track.
     * Respects Bug Fix 2 (Joint Tokens require 2 pawns) and Rule 4 (Immunity at Distance 4 & 2).
     * @param {Object} player 
     * @returns {number[]} Array of unique dice values that achieve a cut.
     */
    getCuttingDiceValues(player) {
        if (!player || !player.tokens) return [];
        const cuttingValues = new Set();
        const pData = BOARD_DATA.PLAYERS[player.id.toUpperCase()];
        if (!pData) return [];

        player.tokens.forEach(token => {
            // Only tokens already on the track can cut opponent tokens
            if (token.state !== 'TRACK') return;

            for (let roll = 1; roll <= 6; roll++) {
                // Gameplay Rule 4: Distance 4 and 2 NEVER cut!
                // "যদি কখনো কেউ গুটি ৪ অথবা ২ তে চান্স দিয়ে রাখে। সেই গুটি কখনো খাওয়া যাবে না।টোটাল গেমের ভিতর ৪অথবা২ তে খাওয়ার অপশন থাকলে কখনোই খাওয়া যাবে না।"
                if (roll === 4 || roll === 2) continue;

                const targetStep = token.stepCount + roll;
                // Cut can only occur on the common 52-cell track (stepCount < 51)
                if (targetStep < 51) {
                    const targetTrackIdx = (pData.startIndex + targetStep) % 52;
                    if (!BOARD_DATA.isSafeIndex(targetTrackIdx)) {
                        for (const otherPlayer of this.players) {
                            if (otherPlayer.id === player.id) continue;
                            if (this.mode === 'TEAM_2V2' && !this.friendlyKill && this.isTeammate(player.id, otherPlayer.id)) continue;

                            const oppTokens = otherPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === targetTrackIdx && !t.hasShield);
                            if (oppTokens.length === 0) continue;

                            // Bug Fix 2: Joint pair check (জোড় গুটি)
                            // "যে কোনো জোড় গুটি, ১টা গুটি দিয়েই জোড়া ২টা খাওয়া যাচ্ছে, জোড়া খেতে গেলে ২ টা গুটি দিয়েই খেতে হবে।"
                            if (oppTokens.length >= 2) {
                                // Attacker must also have 2 tokens on targetTrackIdx to cut joint pair
                                const ownTokensOnSquare = player.tokens.filter(t => t.id !== token.id && t.state === 'TRACK' && t.trackIndex === targetTrackIdx);
                                if (ownTokensOnSquare.length === 0) {
                                    // 1 attacking token cannot cut a joint pair
                                    continue;
                                }
                            }

                            cuttingValues.add(roll);
                            break;
                        }
                    }
                }
            }
        });

        // TEAM_2V2 Partner Assistance: If player has all 4 finished, check teammate's track tokens
        if (this.mode === 'TEAM_2V2' && player.finishedTokens === 4) {
            const teammate = this.players.find(p => p.id !== player.id && this.isTeammate(player.id, p.id));
            if (teammate && teammate.finishedTokens < 4) {
                const tmData = BOARD_DATA.PLAYERS[teammate.id.toUpperCase()];
                if (tmData) {
                    teammate.tokens.forEach(token => {
                        if (token.state !== 'TRACK') return;
                        for (let roll = 1; roll <= 6; roll++) {
                            if (roll === 4 || roll === 2) continue;
                            const targetStep = token.stepCount + roll;
                            if (targetStep < 51) {
                                const targetTrackIdx = (tmData.startIndex + targetStep) % 52;
                                if (!BOARD_DATA.isSafeIndex(targetTrackIdx)) {
                                    for (const otherPlayer of this.players) {
                                        if (this.isTeammate(player.id, otherPlayer.id)) continue;
                                        const oppTokens = otherPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === targetTrackIdx && !t.hasShield);
                                        if (oppTokens.length === 0) continue;
                                        if (oppTokens.length >= 2) {
                                            const tmTokensOnSquare = teammate.tokens.filter(t => t.id !== token.id && t.state === 'TRACK' && t.trackIndex === targetTrackIdx);
                                            if (tmTokensOnSquare.length === 0) continue;
                                        }
                                        cuttingValues.add(roll);
                                        break;
                                    }
                                }
                            }
                        }
                    });
                }
            }
        }

        return Array.from(cuttingValues);
    }

    /**
     * Authoritative Fair RNG with Specific Gameplay Rules:
     * - Rule 1: Guaranteed capture within 1 to 4 rolls when cut opportunity exists (১,২,৩,৪ দামের ভিতর সিওর খাওয়া)
     * - Rule 2: Guaranteed 6 every 5 rolls (প্রতি ৫ দামের ভিতর ছয় একবার পড়বেই, ২ বারও পড়তে পারে)
     * - Rule 3: 100% Guaranteed capture on 1st roll if opponent leaves chance at distance 5 (৫ এ কেউ চান্স দিলে ১০০% প্রথম দামেই খাওয়া)
     * - Rule 4: Distance 4 and 2 can NEVER cut (৪ অথবা ২ তে খাওয়ার অপশন থাকলে কখনোই খাওয়া যাবে না)
     */
    generateDiceValue(player) {
        if (!player) return Math.floor(Math.random() * 6) + 1;
        if (player.rollsWithoutSix === undefined) player.rollsWithoutSix = 0;
        if (player.captureAttempts === undefined) player.captureAttempts = 0;

        const cuttingValues = this.getCuttingDiceValues(player);
        const hasCutOpportunity = (cuttingValues && cuttingValues.length > 0);

        let chosenDice = null;

        // Rule 3: Distance 5 is 100% guaranteed capture on the VERY FIRST roll
        // "যদি কখোনো কারো গুটি ৫ এ চান্স দিয়ে রাখে। ৫ এ কেউ চান্স দিলে সেই গুটি ১০০% প্রথম দামেই খাওয়া যাবে।"
        if (hasCutOpportunity && cuttingValues.includes(5)) {
            chosenDice = 5;
            player.captureAttempts = 0;
        }
        // Rule 2: Guaranteed 6 within 5 rolls (on 5th roll without 6, or sooner)
        // "প্রতি ৫ দামের ভিতর ছয় একবার পড়বেই। ২ বার ও পড়তে পারে। কিন্তু ৫ দামের ভিতর ১ বার ৬ পরবেই।"
        else if (player.rollsWithoutSix >= 4) {
            chosenDice = 6;
            player.rollsWithoutSix = 0;
            if (hasCutOpportunity && cuttingValues.includes(6)) {
                player.captureAttempts = 0;
            }
        }
        // Rule 1: Guaranteed capture within 4 rolls (1..4)
        // "গুটি খাবার অপশন তৈরি হলে বা সামনে থাকলে ৪ বার চান্স এর মধ্যে সিওর খাওয়া যাবে।মানে ১,২,৩,৪ দামের ভিতর সিওর খাওয়া।৪দামের বেশি যেনো না লাগে।"
        else if (hasCutOpportunity) {
            player.captureAttempts++;
            let shouldCut = false;

            if (player.captureAttempts >= 4) {
                // 4th roll is 100% guaranteed to capture!
                shouldCut = true;
            } else if (player.captureAttempts === 3) {
                // High chance (70%) on 3rd attempt
                shouldCut = (Math.random() < 0.70);
            } else if (player.captureAttempts === 2) {
                // Medium chance (50%) on 2nd attempt
                shouldCut = (Math.random() < 0.50);
            } else {
                // 35% chance on 1st attempt
                shouldCut = (Math.random() < 0.35);
            }

            if (shouldCut) {
                chosenDice = cuttingValues[Math.floor(Math.random() * cuttingValues.length)];
                player.captureAttempts = 0;
            } else {
                // Pick a non-cutting roll
                const nonCuttingValues = [1, 2, 3, 4, 5, 6].filter(val => !cuttingValues.includes(val));
                if (nonCuttingValues.length > 0) {
                    chosenDice = nonCuttingValues[Math.floor(Math.random() * nonCuttingValues.length)];
                } else {
                    chosenDice = Math.floor(Math.random() * 6) + 1;
                }
            }
        }
        // Standard fair roll
        else {
            player.captureAttempts = 0;
            chosenDice = Math.floor(Math.random() * 6) + 1;
        }

        // Update rollsWithoutSix tracker
        if (chosenDice === 6) {
            player.rollsWithoutSix = 0;
        } else {
            player.rollsWithoutSix++;
        }

        return chosenDice;
    }

    // Roll Dice with Fair Authoritative RNG and Strict Gameplay Rules
    // Supports optional forcedDice from authoritative multiplayer server
    rollDice(forcedDice = null) {
        if (this.state !== 'WAITING_ROLL') return null;

        this.state = 'ROLLING';

        const player = this.getCurrentPlayer();
        if (player.rollsWithoutSix === undefined) player.rollsWithoutSix = 0;
        if (player.captureAttempts === undefined) player.captureAttempts = 0;

        // Rule 5: Increment homeStretchRolls for any token belonging to this player in HOME_STRETCH
        // "৪ জনের যে কোনো গুটি যদি ঘরে উঠে যায়।তাহলে মিনিমাম ১০ দাম লাগবে সেই গুটি উঠা হতে বা End হতে।"
        if (player.tokens) {
            player.tokens.forEach(tok => {
                if (tok.state === 'HOME_STRETCH' || (tok.stepCount >= 51 && tok.stepCount < 56)) {
                    tok.homeStretchRolls = (tok.homeStretchRolls || 0) + 1;
                }
            });
        }

        let chosenDice = null;

        if (forcedDice !== null && forcedDice >= 1 && forcedDice <= 6) {
            // Authoritative server-provided roll
            chosenDice = forcedDice;
            if (chosenDice === 6) {
                player.rollsWithoutSix = 0;
            } else {
                player.rollsWithoutSix++;
            }
        } else {
            chosenDice = this.generateDiceValue(player);
        }

        this.diceValue = chosenDice;

        if (this.diceValue === 6) {
            this.consecutiveSixes++;
            player.rollsWithoutSix = 0;
        } else {
            this.consecutiveSixes = 0;
        }

        // Rule: 3 consecutive sixes cancels turn
        if (this.consecutiveSixes === 3) {
            this.consecutiveSixes = 0;
            this.state = 'THREE_SIXES_CANCELED';
            return {
                dice: this.diceValue,
                threeSixesCanceled: true,
                validTokens: []
            };
        }

        this.calculateValidMoves();

        if (this.validMoves.length === 0) {
            this.state = 'NO_MOVES';
            return {
                dice: this.diceValue,
                threeSixesCanceled: false,
                validTokens: [],
                noMoves: true
            };
        }

        this.state = 'SELECTING_TOKEN';
        return {
            dice: this.diceValue,
            threeSixesCanceled: false,
            validTokens: this.validMoves
        };
    }

    // Check which tokens can move with current dice
    calculateValidMoves(boostSteps = 0) {
        const player = this.getCurrentPlayer();
        const steps = this.diceValue + boostSteps;
        this.validMoves = [];

        // 1. Current player's own tokens
        player.tokens.forEach(token => {
            if (token.state === 'FINISHED') return;

            // In Yard: need 6 (or 1 in Quick Rush)
            if (token.state === 'YARD') {
                const canExit = (this.mode === 'QUICK_RUSH') ? (steps === 1 || steps === 6) : (steps === 6);
                if (canExit) {
                    this.validMoves.push({
                        token: token,
                        type: 'EXIT_YARD',
                        targetStepCount: 0,
                        ownerPlayerId: player.id
                    });
                }
                return;
            }

            // On Track or Home Stretch: Max step count is 56 (finished)
            const targetStep = token.stepCount + steps;
            if (targetStep <= 56) {
                // Rule 5: Minimum 10 rolls in home stretch before finishing
                // "৪ জনের যে কোনো গুটি যদি ঘরে উঠে যায়।তাহলে মিনিমাম ১০ দাম লাগবে সেই গুটি উঠা হতে বা End হতে।"
                if (targetStep === 56 && (token.homeStretchRolls || 0) < 10) {
                    return;
                }

                this.validMoves.push({
                    token: token,
                    type: 'MOVE',
                    targetStepCount: targetStep,
                    ownerPlayerId: player.id
                });
            }
        });

        // 2. TEAM 2V2 Partner Assistance:
        // If current player has all 4 tokens finished, they can roll to move their teammate's tokens!
        if (this.mode === 'TEAM_2V2' && player.finishedTokens === 4) {
            const teammate = this.players.find(p => p.id !== player.id && this.isTeammate(player.id, p.id));
            if (teammate && teammate.finishedTokens < 4) {
                teammate.tokens.forEach(token => {
                    if (token.state === 'FINISHED') return;
                    if (token.state === 'YARD') {
                        if (steps === 6) {
                            this.validMoves.push({
                                token: token,
                                type: 'EXIT_YARD',
                                targetStepCount: 0,
                                ownerPlayerId: teammate.id
                            });
                        }
                        return;
                    }
                    const targetStep = token.stepCount + steps;
                    if (targetStep <= 56) {
                        if (targetStep === 56 && (token.homeStretchRolls || 0) < 10) {
                            return;
                        }
                        this.validMoves.push({
                            token: token,
                            type: 'MOVE',
                            targetStepCount: targetStep,
                            ownerPlayerId: teammate.id
                        });
                    }
                });
            }
        }

        return this.validMoves;
    }

    /**
     * Backward-compatible alias for calculateValidMoves
     * @param {number|null} roll 
     * @returns {Array} Array of valid move options
     */
    getValidMoves(roll = null) {
        if (roll !== null && roll !== undefined) {
            this.diceValue = roll;
        }
        return this.calculateValidMoves();
    }

    // Peek exact move outcome before animation (for authoritative real-time network sync)
    peekMoveOutcome(tokenId) {
        let moveOption = this.validMoves.find(m => m.token.id === tokenId);
        if (!moveOption) {
            const curP = this.getCurrentPlayer();
            const tok = curP?.tokens?.find(t => t.id === tokenId);
            if (tok) {
                if (tok.state === 'YARD') {
                    moveOption = { token: tok, type: 'EXIT_YARD', targetStepCount: 0, ownerPlayerId: curP.id };
                } else {
                    const targetStep = tok.stepCount + (this.diceValue || 1);
                    if (targetStep <= 56) {
                        moveOption = { token: tok, type: 'MOVE', targetStepCount: targetStep, ownerPlayerId: curP.id };
                    }
                }
            }
        }
        if (!moveOption) return null;

        const player = this.getCurrentPlayer();
        const token = moveOption.token;
        const ownerId = moveOption.ownerPlayerId || token.color || player.id;
        const ownerPlayer = this.players.find(p => p.id === ownerId) || player;
        const pData = BOARD_DATA.PLAYERS[ownerId.toUpperCase()];

        let targetState = 'TRACK';
        let targetStepCount = 0;
        let trackIndex = -1;
        let cutOccurred = false;
        let cutTokenInfo = null;
        let tokenFinished = false;

        if (moveOption.type === 'EXIT_YARD') {
            targetState = 'TRACK';
            targetStepCount = 0;
            trackIndex = pData.startIndex;
        } else {
            targetStepCount = moveOption.targetStepCount;
            if (targetStepCount < 51) {
                targetState = 'TRACK';
                trackIndex = (pData.startIndex + targetStepCount) % 52;
            } else if (targetStepCount >= 51 && targetStepCount < 56) {
                targetState = 'HOME_STRETCH';
                trackIndex = -1;
            } else if (targetStepCount === 56) {
                targetState = 'FINISHED';
                trackIndex = -1;
                tokenFinished = true;
            }
        }

        // Collision check if target is on common track
        if (targetState === 'TRACK') {
            const isSafe = BOARD_DATA.isSafeIndex(trackIndex);
            if (!isSafe) {
                const isImmuneDistance = (this.diceValue === 4 || this.diceValue === 2);
                if (!isImmuneDistance) {
                    const attackerTokensOnSquare = ownerPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === trackIndex && t.id !== token.id);
                    const attackerCount = attackerTokensOnSquare.length + 1;

                    for (const otherPlayer of this.players) {
                        if (otherPlayer.id === ownerId) continue;
                        if (this.mode === 'TEAM_2V2' && !this.friendlyKill && this.isTeammate(ownerId, otherPlayer.id)) continue;

                        const oppTokens = otherPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === trackIndex);
                        if (oppTokens.length === 0) continue;

                        // Joint pair check: 1 attacker token cannot cut joint pair
                        if (oppTokens.length >= 2 && attackerCount < 2) continue;

                        const victim = oppTokens[0];
                        if (!victim.hasShield) {
                            cutOccurred = true;
                            cutTokenInfo = { player: otherPlayer.id, token: victim.id };
                            break;
                        }
                    }
                }
            }
        }

        const bonusTurn = (this.diceValue === 6 || cutOccurred || tokenFinished);

        return {
            color: ownerId,
            tokenId: token.id,
            dice: this.diceValue,
            targetState,
            targetStepCount,
            trackIndex,
            cutOccurred,
            cutTokenInfo,
            tokenFinished,
            bonusTurn
        };
    }

    // Execute Move for a chosen token
    moveToken(tokenId, boostSteps = 0, skipPassTurn = false, authoritativeData = null) {
        if (this.state !== 'SELECTING_TOKEN' && this.state !== 'MOVING' && this.state !== 'WAITING_ROLL') return null;

        // Authoritative Remote Move Sync (Prevents any multi-device desynchronization)
        if (authoritativeData) {
            this.state = 'MOVING';
            const player = (authoritativeData.color && this.players.find(p => p.id === authoritativeData.color)) || this.getCurrentPlayer();
            let token = player.tokens.find(t => t.id === tokenId);
            if (!token) {
                for (const p of this.players) {
                    token = p.tokens.find(t => t.id === tokenId);
                    if (token) break;
                }
            }
            if (!token) return null;

            token.state = authoritativeData.targetState;
            token.stepCount = authoritativeData.targetStepCount;
            token.trackIndex = authoritativeData.trackIndex;

            let tokenFinished = false;
            if (authoritativeData.targetState === 'FINISHED' && !token._countedFinished) {
                token._countedFinished = true;
                player.finishedTokens++;
                tokenFinished = true;
            }

            let cutOccurred = false;
            let cutTokenInfo = null;
            if (authoritativeData.cutOccurred && authoritativeData.cutTokenInfo) {
                const victimPlayer = this.players.find(p => p.id === authoritativeData.cutTokenInfo.player);
                const victimToken = victimPlayer?.tokens?.find(t => t.id === authoritativeData.cutTokenInfo.token);
                if (victimToken) {
                    victimToken.state = 'YARD';
                    victimToken.trackIndex = -1;
                    victimToken.stepCount = 0;
                    victimToken.homeStretchRolls = 0;
                    cutOccurred = true;
                    cutTokenInfo = authoritativeData.cutTokenInfo;
                }
            }

            const bonusTurn = (authoritativeData.bonusTurn !== undefined)
                ? authoritativeData.bonusTurn
                : (this.diceValue === 6 || cutOccurred || tokenFinished);

            const totalTokens = (this.mode === 'QUICK_RUSH') ? 2 : 4;
            const playerWon = (player.finishedTokens >= totalTokens);

            const moveResult = {
                player: player.id,
                token: token,
                tokenId: token.id,
                targetState: token.state,
                targetStepCount: token.stepCount,
                trackIndex: token.trackIndex,
                cutOccurred: cutOccurred,
                cutTokenInfo: cutTokenInfo,
                tokenFinished: tokenFinished,
                bonusTurn: bonusTurn,
                playerWon: playerWon,
                gameOver: false
            };

            if (bonusTurn && !playerWon) {
                this.state = 'WAITING_ROLL';
                this.validMoves = [];
            } else if (!skipPassTurn) {
                this.passTurn();
            } else {
                this.state = 'WAITING_ROLL';
                this.validMoves = [];
                this.diceValue = 0;
                this.consecutiveSixes = 0;
            }

            return moveResult;
        }

        let moveOption = this.validMoves.find(m => m.token.id === tokenId);
        if (!moveOption) {
            const curP = this.getCurrentPlayer();
            const tok = curP?.tokens?.find(t => t.id === tokenId);
            if (tok) {
                if (tok.state === 'YARD') {
                    moveOption = { token: tok, type: 'EXIT_YARD', targetStepCount: 0, ownerPlayerId: curP.id };
                } else {
                    const targetStep = tok.stepCount + (this.diceValue || 1);
                    if (targetStep <= 56) {
                        if (!(targetStep === 56 && (tok.homeStretchRolls || 0) < 10)) {
                            moveOption = { token: tok, type: 'MOVE', targetStepCount: targetStep, ownerPlayerId: curP.id };
                        }
                    }
                }
            }
        }
        if (!moveOption) return null;

        this.state = 'MOVING';
        const player = this.getCurrentPlayer();
        const token = moveOption.token;
        const ownerId = moveOption.ownerPlayerId || token.color || player.id;
        const ownerPlayer = this.players.find(p => p.id === ownerId) || player;
        const pData = BOARD_DATA.PLAYERS[ownerId.toUpperCase()];

        let cutOccurred = false;
        let cutTokenInfo = null;
        let tokenFinished = false;

        if (moveOption.type === 'EXIT_YARD') {
            token.state = 'TRACK';
            token.stepCount = 0;
            token.trackIndex = pData.startIndex;
            token.homeStretchRolls = 0;
        } else {
            token.stepCount = moveOption.targetStepCount;

            if (token.stepCount < 51) {
                // Still on common track
                token.state = 'TRACK';
                token.trackIndex = (pData.startIndex + token.stepCount) % 52;
            } else if (token.stepCount >= 51 && token.stepCount < 56) {
                // Inside Home Stretch
                token.state = 'HOME_STRETCH';
                token.trackIndex = -1; // off common track
                if (token.homeStretchRolls === undefined) {
                    token.homeStretchRolls = 0;
                }
            } else if (token.stepCount === 56) {
                // Reached Final Goal
                token.state = 'FINISHED';
                token.trackIndex = -1;
                ownerPlayer.finishedTokens++;
                tokenFinished = true;
            }
        }

        // Check Collision / Cutting only if on Common Track
        if (token.state === 'TRACK') {
            const isSafe = BOARD_DATA.isSafeIndex(token.trackIndex);
            if (!isSafe) {
                // Rule 4: Distance 4 and 2 NEVER cut!
                // "যদি কখনো কেউ গুটি ৪ অথবা ২ তে চান্স দিয়ে রাখে। সেই গুটি কখনো খাওয়া যাবে না।টোটাল গেমের ভিতর ৪অথবা২ তে খাওয়ার অপশন থাকলে কখনোই খাওয়া যাবে না।"
                const isImmuneDistance = (this.diceValue === 4 || this.diceValue === 2);

                if (!isImmuneDistance) {
                    // Count how many tokens current player (attacker) has on this trackIndex
                    const attackerTokensOnSquare = ownerPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === token.trackIndex);
                    const attackerCount = attackerTokensOnSquare.length;

                    // Check other players' tokens on this trackIndex
                    this.players.forEach(otherPlayer => {
                        if (otherPlayer.id === ownerId) return; // don't cut own tokens
                        if (this.mode === 'TEAM_2V2' && !this.friendlyKill && this.isTeammate(ownerId, otherPlayer.id)) return; // don't cut teammate!

                        const opponentTokensOnSquare = otherPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === token.trackIndex);
                        if (opponentTokensOnSquare.length === 0) return;

                        // Bug Fix 2: Joint pair check (জোড় গুটি)
                        // "যে কোনো জোড় গুটি, ১টা গুটি দিয়েই জোড়া ২টা খাওয়া যাচ্ছে, জোড়া খেতে গেলে ২ টা গুটি দিয়েই খেতে হবে।"
                        if (opponentTokensOnSquare.length >= 2 && attackerCount < 2) {
                            // 1 attacker token cannot cut opponent joint pair!
                            return;
                        }

                        opponentTokensOnSquare.forEach(otherToken => {
                            if (otherToken.hasShield) {
                                // Shield protects token once!
                                otherToken.hasShield = false;
                            } else {
                                // Cut opponent token!
                                otherToken.state = 'YARD';
                                otherToken.trackIndex = -1;
                                otherToken.stepCount = 0;
                                otherToken.homeStretchRolls = 0;
                                cutOccurred = true;
                                cutTokenInfo = { player: otherPlayer.id, token: otherToken.id };
                            }
                        });
                    });
                }
            }
        }

        // Check Team Mode Win Condition (Combined 8 tokens for Team A or Team B)
        if (this.mode === 'TEAM_2V2') {
            const teamA = this.players.filter(p => ['blue', 'green'].includes(p.id));
            const teamB = this.players.filter(p => ['red', 'yellow'].includes(p.id));
            const teamAFinished = teamA.reduce((sum, p) => sum + p.finishedTokens, 0);
            const teamBFinished = teamB.reduce((sum, p) => sum + p.finishedTokens, 0);

            if (teamAFinished >= 8 && !this.winners.includes('team_a')) {
                this.winners.push('team_a');
                this.state = 'GAME_OVER';
                return {
                    token: token,
                    cutOccurred: cutOccurred,
                    cutTokenInfo: cutTokenInfo,
                    tokenFinished: tokenFinished,
                    bonusTurn: false,
                    playerWon: true,
                    gameOver: true,
                    winners: ['team_a'],
                    teamWinnerTitle: 'টিম A (Blue & Green) বিজয়ী হয়েছে!'
                };
            } else if (teamBFinished >= 8 && !this.winners.includes('team_b')) {
                this.winners.push('team_b');
                this.state = 'GAME_OVER';
                return {
                    token: token,
                    cutOccurred: cutOccurred,
                    cutTokenInfo: cutTokenInfo,
                    tokenFinished: tokenFinished,
                    bonusTurn: false,
                    playerWon: true,
                    gameOver: true,
                    winners: ['team_b'],
                    teamWinnerTitle: 'টিম B (Red & Yellow) বিজয়ী হয়েছে!'
                };
            }
        }

        // Check if individual player won in Classic / Quick / Power modes
        const totalTokens = (this.mode === 'QUICK_RUSH') ? 2 : 4;
        let playerWon = false;
        if (ownerPlayer.finishedTokens === totalTokens && !ownerPlayer.rank) {
            this.winners.push(ownerPlayer.id);
            ownerPlayer.rank = this.winners.length;
            playerWon = true;

            // Check if game is completely over
            if (this.winners.length >= this.players.length - 1) {
                this.state = 'GAME_OVER';
                return {
                    token: token,
                    cutOccurred: cutOccurred,
                    cutTokenInfo: cutTokenInfo,
                    tokenFinished: tokenFinished,
                    bonusTurn: false,
                    playerWon: true,
                    gameOver: true,
                    winners: this.winners
                };
            }
        }

        // Determine if player gets a Bonus Turn:
        // 1. Rolled a 6 (and not finished or 3-sixes)
        // 2. Cut an opponent's token
        // 3. Sent a token into the home goal
        const bonusTurn = (this.diceValue === 6 || cutOccurred || tokenFinished);

        const moveResult = {
            player: player.id,
            token: token,
            tokenId: token.id,
            targetState: token.state,
            targetStepCount: token.stepCount,
            trackIndex: token.trackIndex,
            cutOccurred: cutOccurred,
            cutTokenInfo: cutTokenInfo,
            tokenFinished: tokenFinished,
            bonusTurn: bonusTurn,
            playerWon: playerWon,
            gameOver: false
        };

        if (bonusTurn && !playerWon) {
            this.state = 'WAITING_ROLL';
            this.validMoves = [];
        } else if (!skipPassTurn) {
            this.passTurn();
        } else {
            this.state = 'WAITING_ROLL';
            this.validMoves = [];
            this.diceValue = 0;
            this.consecutiveSixes = 0;
        }

        return moveResult;
    }

    passTurn() {
        if (this.state === 'GAME_OVER') return;

        this.consecutiveSixes = 0;
        this.validMoves = [];

        // Find next active player
        let nextIndex = this.currentTurnIndex;
        let found = false;
        for (let i = 0; i < this.players.length; i++) {
            nextIndex = (nextIndex + 1) % this.players.length;
            const nextPlayer = this.players[nextIndex];

            if (this.mode === 'TEAM_2V2') {
                // In Team mode, a player can still roll if their teammate has unfinished tokens
                const teammate = this.players.find(p => p.id !== nextPlayer.id && this.isTeammate(nextPlayer.id, p.id));
                if (nextPlayer.finishedTokens < 4 || (teammate && teammate.finishedTokens < 4)) {
                    found = true;
                    break;
                }
            } else {
                if (!nextPlayer.rank) {
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            this.currentTurnIndex = nextIndex;
            this.state = 'WAITING_ROLL';
        } else {
            this.state = 'GAME_OVER';
        }
    }

    // Use Power-Up (POWER_DICE mode)
    usePowerUp(powerType, tokenId = null) {
        if (this.mode !== 'POWER_DICE') return false;
        const player = this.getCurrentPlayer();
        if (!this.powerUps[player.id] || this.powerUps[player.id][powerType] <= 0) return false;

        if (powerType === 'shield') {
            const token = player.tokens.find(t => t.id === tokenId && t.state === 'TRACK');
            if (!token) return false;
            token.hasShield = true;
            this.powerUps[player.id].shield--;
            return true;
        }

        if (powerType === 'reroll') {
            if (this.state !== 'SELECTING_TOKEN') return false;
            this.powerUps[player.id].reroll--;
            this.state = 'WAITING_ROLL';
            return this.rollDice();
        }

        if (powerType === 'jump') {
            if (this.state !== 'SELECTING_TOKEN') return false;
            this.powerUps[player.id].jump--;
            this.calculateValidMoves(2); // +2 steps boost
            return true;
        }

        return false;
    }

    calculateTokenPath(tokenId, boostSteps = 0) {
        let moveOption = this.validMoves.find(m => m.token.id === tokenId);
        if (!moveOption) {
            const curP = this.getCurrentPlayer();
            const tok = curP?.tokens?.find(t => t.id === tokenId);
            if (tok) {
                if (tok.state === 'YARD') {
                    moveOption = { token: tok, type: 'EXIT_YARD', targetStepCount: 0, ownerPlayerId: curP.id };
                } else {
                    moveOption = { token: tok, type: 'MOVE', targetStepCount: Math.min(56, tok.stepCount + (this.diceValue || 1)), ownerPlayerId: curP.id };
                }
            }
        }
        if (!moveOption) return [];

        const player = this.getCurrentPlayer();
        const token = moveOption.token;
        const ownerColor = moveOption.ownerPlayerId || token.color || player.id;
        const pData = BOARD_DATA.PLAYERS[ownerColor.toUpperCase()];
        const path = [];

        if (moveOption.type === 'EXIT_YARD') {
            path.push({
                state: 'TRACK',
                stepCount: 0,
                trackIndex: pData.startIndex,
                coord: BOARD_DATA.TRACK[pData.startIndex]
            });
            return path;
        }

        const startStep = token.stepCount;
        const targetStep = moveOption.targetStepCount;

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
                const stretchIdx = s - 51;
                path.push({
                    state: 'HOME_STRETCH',
                    stepCount: s,
                    trackIndex: -1,
                    coord: pData.homeStretch[stretchIdx]
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

        return path;
    }
}

window.LudoGameEngine = LudoGameEngine;
