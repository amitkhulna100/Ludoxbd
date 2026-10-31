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
                    hasShield: false
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
                cutPlan: [] // 33% Opponent Token Cut Plan (1 in 3 opportunities)
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
    getCuttingDiceValues(player) {
        if (!player || !player.tokens) return [];
        const cuttingValues = new Set();
        const pData = BOARD_DATA.PLAYERS[player.id.toUpperCase()];
        if (!pData) return [];

        player.tokens.forEach(token => {
            // Only tokens already on the track can cut opponent tokens
            if (token.state !== 'TRACK') return;

            for (let roll = 1; roll <= 6; roll++) {
                const targetStep = token.stepCount + roll;
                // Cut can only occur on the common 52-cell track (stepCount < 51)
                if (targetStep < 51) {
                    const targetTrackIdx = (pData.startIndex + targetStep) % 52;
                    if (!BOARD_DATA.isSafeIndex(targetTrackIdx)) {
                        for (const otherPlayer of this.players) {
                            if (otherPlayer.id === player.id) continue;
                            if (this.mode === 'TEAM_2V2' && !this.friendlyKill && this.isTeammate(player.id, otherPlayer.id)) continue;

                            for (const otherToken of otherPlayer.tokens) {
                                if (otherToken.state === 'TRACK' && otherToken.trackIndex === targetTrackIdx && !otherToken.hasShield) {
                                    cuttingValues.add(roll);
                                    break;
                                }
                            }
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
                            const targetStep = token.stepCount + roll;
                            if (targetStep < 51) {
                                const targetTrackIdx = (tmData.startIndex + targetStep) % 52;
                                if (!BOARD_DATA.isSafeIndex(targetTrackIdx)) {
                                    for (const otherPlayer of this.players) {
                                        if (this.isTeammate(player.id, otherPlayer.id)) continue;
                                        for (const otherToken of otherPlayer.tokens) {
                                            if (otherToken.state === 'TRACK' && otherToken.trackIndex === targetTrackIdx && !otherToken.hasShield) {
                                                cuttingValues.add(roll);
                                                break;
                                            }
                                        }
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

    // Roll Dice with Fair Authoritative RNG and 33% Opponent Token Capture Ratio
    // Supports optional forcedDice from authoritative multiplayer server
    rollDice(forcedDice = null) {
        if (this.state !== 'WAITING_ROLL') return null;

        this.state = 'ROLLING';

        const player = this.getCurrentPlayer();
        if (player.rollsWithoutSix === undefined) player.rollsWithoutSix = 0;

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
            // Check for Opponent Token Capture Opportunity (গুটি খাবার সুযোগ)
            const cuttingValues = this.getCuttingDiceValues(player);
            const hasCutOpportunity = (cuttingValues && cuttingValues.length > 0);

            if (player.rollsWithoutSix >= 4) {
                // Rule 1: Guaranteed 6 within 5 rolls (প্রতি ৫ দামের ভিতর ১ বার ছয় পরবেই)
                chosenDice = 6;
                player.rollsWithoutSix = 0;

                // If rolling 6 lands on a cut and there was an opportunity, mark one opportunity in the cycle
                if (hasCutOpportunity) {
                    if (!player.cutPlan || player.cutPlan.length === 0) {
                        player.cutPlan = [true, false, false].sort(() => Math.random() - 0.5);
                    }
                    player.cutPlan.pop();
                }
            } else if (hasCutOpportunity) {
                // Rule 2: 33% Opponent Token Capture Ratio (সুযোগ থাকলে ৩৩% খাওয়া যাবে, প্রতি ৩ বারে ১ বার)
                if (!player.cutPlan || player.cutPlan.length === 0) {
                    player.cutPlan = [true, false, false].sort(() => Math.random() - 0.5);
                }
                const shouldCut = player.cutPlan.pop();

                if (shouldCut) {
                    // Grant roll from cutting values
                    chosenDice = cuttingValues[Math.floor(Math.random() * cuttingValues.length)];
                } else {
                    // Grant roll that avoids cutting
                    const nonCuttingValues = [1, 2, 3, 4, 5, 6].filter(val => !cuttingValues.includes(val));
                    if (nonCuttingValues.length > 0) {
                        chosenDice = nonCuttingValues[Math.floor(Math.random() * nonCuttingValues.length)];
                    } else {
                        chosenDice = Math.floor(Math.random() * 6) + 1;
                    }
                }

                if (chosenDice === 6) {
                    player.rollsWithoutSix = 0;
                } else {
                    player.rollsWithoutSix++;
                }
            } else {
                // Standard fair 1-6 die roll
                const rolled = Math.floor(Math.random() * 6) + 1;
                chosenDice = rolled;
                if (rolled === 6) {
                    player.rollsWithoutSix = 0;
                } else {
                    player.rollsWithoutSix++;
                }
            }
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

    // Execute Move for a chosen token
    moveToken(tokenId, boostSteps = 0, skipPassTurn = false) {
        if (this.state !== 'SELECTING_TOKEN' && this.state !== 'MOVING' && this.state !== 'WAITING_ROLL') return null;

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
                // Check other players' tokens on this trackIndex
                this.players.forEach(otherPlayer => {
                    if (otherPlayer.id === ownerId) return; // don't cut own tokens
                    if (this.mode === 'TEAM_2V2' && !this.friendlyKill && this.isTeammate(ownerId, otherPlayer.id)) return; // don't cut teammate!

                    otherPlayer.tokens.forEach(otherToken => {
                        if (otherToken.state === 'TRACK' && otherToken.trackIndex === token.trackIndex) {
                            if (otherToken.hasShield) {
                                // Shield protects token once!
                                otherToken.hasShield = false;
                            } else {
                                // Cut opponent token!
                                otherToken.state = 'YARD';
                                otherToken.trackIndex = -1;
                                otherToken.stepCount = 0;
                                cutOccurred = true;
                                cutTokenInfo = { player: otherPlayer.id, token: otherToken.id };
                            }
                        }
                    });
                });
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
