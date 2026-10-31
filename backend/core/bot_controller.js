// Server-Side Bot Controller for Ludo X BD
// Makes intelligent heuristic moves for AI players and disconnected clients

const SAFE_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

class BotController {
    /**
     * Chooses the best valid move for the active player.
     * @param {AuthoritativeEngine} engine
     * @returns {number|null} tokenId to move
     */
    static chooseBestMove(engine) {
        const validMoves = engine.validMoves;
        if (!validMoves || validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0].token.id;

        const player = engine.getCurrentPlayer();
        let bestScore = -Infinity;
        let chosenTokenId = validMoves[0].token.id;

        validMoves.forEach(move => {
            const token = move.token;
            let score = 0;

            // 1. Goal move: entering home triangle
            if (move.targetStepCount === 56) {
                score += 2000;
            }

            // 2. Entering safe home stretch
            if (token.stepCount < 51 && move.targetStepCount >= 51) {
                score += 800;
            }

            // 3. Cutting opponent check (with Bug Fix 2 Joint Pair check)
            if (move.targetStepCount < 51 && move.type !== 'EXIT_YARD') {
                const targetTrackIdx = (player.startIndex + move.targetStepCount) % 52;
                if (!SAFE_INDICES.includes(targetTrackIdx)) {
                    const attackerTokensOnSquare = player.tokens.filter(t => t.id !== token.id && t.state === 'TRACK' && t.trackIndex === targetTrackIdx);
                    const attackerCount = attackerTokensOnSquare.length + 1;

                    engine.players.forEach(otherPlayer => {
                        if (otherPlayer.color === player.color) return;
                        const oppTokens = otherPlayer.tokens.filter(t => t.state === 'TRACK' && t.trackIndex === targetTrackIdx);
                        if (oppTokens.length > 0) {
                            if (oppTokens.length >= 2 && attackerCount < 2) {
                                // Cannot cut joint pair - do not prioritize
                            } else {
                                score += 1500; // High priority: Capture opponent!
                            }
                        }
                    });
                }
            }

            // 4. Leaving yard
            if (move.type === 'EXIT_YARD') {
                score += 450;
            }

            // 5. Landing on a safe star
            if (move.targetStepCount < 51 && move.type !== 'EXIT_YARD') {
                const targetTrackIdx = (player.startIndex + move.targetStepCount) % 52;
                if (SAFE_INDICES.includes(targetTrackIdx)) {
                    score += 500; // Safe spot
                }
            }

            // 6. Natural forward advancement
            score += (move.targetStepCount - token.stepCount) * 10;

            if (score > bestScore) {
                bestScore = score;
                chosenTokenId = token.id;
            }
        });

        return chosenTokenId;
    }
}

module.exports = BotController;
