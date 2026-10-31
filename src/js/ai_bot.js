// Smart AI Bot for Ludo X BD with Tactical Heuristics and Multi-Difficulty Intelligence

class LudoAI {
    /**
     * Chooses the best valid move for the current player or bot.
     * @param {LudoGameEngine} engine 
     * @param {string} difficulty - 'easy', 'medium', or 'hard'
     * @returns {string|null} Chosen tokenId
     */
    static chooseBestMove(engine, difficulty = 'medium') {
        const validMoves = engine.validMoves;
        if (!validMoves || validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0].token.id;

        // EASY DIFFICULTY: 40% probability of choosing a random valid move
        if (difficulty === 'easy' && Math.random() < 0.40) {
            const randomIndex = Math.floor(Math.random() * validMoves.length);
            return validMoves[randomIndex].token.id;
        }

        const player = engine.getCurrentPlayer();
        let bestScore = -Infinity;
        let chosenTokenId = validMoves[0].token.id;

        // Weights according to difficulty
        const isHard = difficulty === 'hard' || difficulty === 'pro';
        const weightCut = isHard ? 1600 : 800;
        const weightEscape = isHard ? 650 : 320;
        const weightSafeStar = isHard ? 500 : 350;
        const weightGoal = 1200;
        const weightHomeStretch = isHard ? 550 : 420;

        validMoves.forEach(move => {
            const token = move.token;
            const ownerId = move.ownerPlayerId || token.color || player.id;
            const pData = BOARD_DATA.PLAYERS[ownerId.toUpperCase()];
            let score = 0;

            // 1. Goal move: entering home triangle
            if (move.targetStepCount === 56) {
                score += weightGoal;
            }

            // 2. Entering safe home stretch
            if (token.stepCount < 51 && move.targetStepCount >= 51) {
                score += weightHomeStretch;
            }

            // 3. Collision check: Can we cut an opponent?
            const isImmuneDistance = (engine.diceValue === 4 || engine.diceValue === 2);
            if (move.targetStepCount < 51 && move.type !== 'EXIT_YARD' && !isImmuneDistance) {
                const targetTrackIdx = (pData.startIndex + move.targetStepCount) % 52;
                if (!BOARD_DATA.isSafeIndex(targetTrackIdx)) {
                    // Check how many tokens attacker has on target
                    const attackerTokensOnTarget = (ownerPlayer?.tokens || player.tokens).filter(t => t.id !== token.id && t.state === 'TRACK' && t.trackIndex === targetTrackIdx).length + 1;

                    engine.players.forEach(otherPlayer => {
                        // Skip self
                        if (otherPlayer.id === player.id) return;
                        // In Team mode, do not cut or target teammates
                        if (engine.isTeammate && engine.isTeammate(ownerId, otherPlayer.id) && !engine.friendlyKill) return;

                        const oppTokensOnSquare = otherPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === targetTrackIdx && !t.hasShield);
                        if (oppTokensOnSquare.length === 0) return;

                        // Joint pair rule: cannot cut joint pair with 1 token
                        if (oppTokensOnSquare.length >= 2 && attackerTokensOnTarget < 2) return;

                        score += weightCut; // High incentive to cut enemy
                        if (oppTokensOnSquare.some(t => t.stepCount > 30)) {
                            // Bonus for cutting an enemy token that has traveled far
                            score += isHard ? 300 : 150;
                        }
                    });
                }
            }

            // 4. Landing on a Safe Star
            if (move.targetStepCount < 51) {
                const targetTrackIdx = (pData.startIndex + move.targetStepCount) % 52;
                if (BOARD_DATA.isSafeIndex(targetTrackIdx)) {
                    score += weightSafeStar;
                }
            }

            // 5. Escaping Danger: Is current token within 1-6 steps of an enemy?
            if (token.state === 'TRACK' && !BOARD_DATA.isSafeIndex(token.trackIndex)) {
                let underThreat = false;
                let threatDistance = 0;
                engine.players.forEach(otherPlayer => {
                    if (otherPlayer.id === ownerId) return;
                    if (engine.isTeammate && engine.isTeammate(ownerId, otherPlayer.id)) return; // Teammate is not a threat

                    otherPlayer.tokens.forEach(otherToken => {
                        if (otherToken.state === 'TRACK') {
                            const dist = (token.trackIndex - otherToken.trackIndex + 52) % 52;
                            if (dist >= 1 && dist <= 6) {
                                underThreat = true;
                                threatDistance = dist;
                            }
                        }
                    });
                });

                if (underThreat) {
                    score += weightEscape + (7 - threatDistance) * 20; // Incentive to flee
                }
            }

            // 6. Exiting Yard when 6 is rolled
            if (move.type === 'EXIT_YARD') {
                const tokenOwner = engine.players.find(p => p.id === ownerId) || player;
                const activeTokens = tokenOwner.tokens.filter(t => t.state === 'TRACK' || t.state === 'HOME_STRETCH').length;
                if (activeTokens <= 1) {
                    score += isHard ? 600 : 450;
                } else {
                    score += isHard ? 300 : 220;
                }
            }

            // 7. General Progress: Advance tokens further
            score += move.targetStepCount * (isHard ? 2.5 : 2);

            // 8. Natural variance (randomness) to avoid robotic repetition
            const noiseRange = isHard ? 8 : (difficulty === 'easy' ? 40 : 20);
            score += Math.random() * noiseRange;

            if (score > bestScore) {
                bestScore = score;
                chosenTokenId = token.id;
            }
        });

        return chosenTokenId;
    }
}

window.LudoAI = LudoAI;
