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
                score += 1500;
            }

            // 2. Entering safe home stretch
            if (token.stepCount < 51 && move.targetStepCount >= 51) {
                score += 500;
            }

            // 3. Cutting opponent check
            if (move.targetStepCount < 51 && move.type !== 'EXIT_YARD') {
                const targetTrackIdx = (player.startIndex + move.targetStepCount) % 52;
                if (!SAFE_INDICES.includes(targetTrackIdx)) {
                    engine.players.forEach(otherPlayer => {
                        if (otherPlayer.color === player.color) return;
                        otherPlayer.tokens.forEach(otherToken => {
                            if (otherToken.state === 'TRACK' && otherToken.trackIndex === targetTrackIdx) {
                                score += 1000; // High priority: Capture opponent!
                            }
                        });
                    });
                }
            }

            // 4. Leaving yard
            if (move.type === 'EXIT_YARD') {
                score += 350;
            }

            // 5. Landing on a safe star
            if (move.targetStepCount < 51 && move.type !== 'EXIT_YARD') {
                const targetTrackIdx = (player.startIndex + move.targetStepCount) % 52;
                if (SAFE_INDICES.includes(targetTrackIdx)) {
                    score += 400; // Safe spot
                }
            }

            // 6. Natural forward advancement
            score += (move.targetStepCount - token.stepCount) * 5;

            if (score > bestScore) {
                bestScore = score;
                chosenTokenId = token.id;
            }
        });

        return chosenTokenId;
    }
}

module.exports = BotController;
