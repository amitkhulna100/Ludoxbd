// Authoritative Ludo Game Engine & Rule Validator
// Full fidelity port of the game rules for backend verification

const SAFE_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

const PLAYER_DATA = {
    RED: { id: 'red', name: 'Red', startIndex: 0, homeEntryIndex: 51 },
    GREEN: { id: 'green', name: 'Green', startIndex: 13, homeEntryIndex: 11 },
    YELLOW: { id: 'yellow', name: 'Yellow', startIndex: 26, homeEntryIndex: 24 },
    BLUE: { id: 'blue', name: 'Blue', startIndex: 39, homeEntryIndex: 37 }
};

class AuthoritativeEngine {
    constructor(config = {}) {
        this.roomCode = config.roomCode || '000000';
        this.boardId = config.boardId || 'dhaka';
        this.mode = config.mode || 'CLASSIC';
        this.playerConfigs = config.players || []; // array of { id, name, color, isBot }

        this.players = [];
        this.currentTurnIndex = 0;
        this.diceValue = 1;
        this.consecutiveSixes = 0;
        this.state = 'WAITING_ROLL'; // 'WAITING_ROLL', 'SELECTING_TOKEN', 'GAME_OVER'
        this.validMoves = [];
        this.winners = [];

        this.initGame();
    }

    static isSafeIndex(trackIndex) {
        return SAFE_INDICES.includes(trackIndex);
    }

    initGame() {
        this.players = this.playerConfigs.map(p => {
            const colorKey = p.color.toUpperCase();
            const pInfo = PLAYER_DATA[colorKey] || PLAYER_DATA.RED;
            const tokens = [];

            for (let i = 0; i < 4; i++) {
                tokens.push({
                    id: i,
                    color: p.color,
                    state: 'YARD', // 'YARD', 'TRACK', 'HOME_STRETCH', 'FINISHED'
                    trackIndex: -1,
                    stepCount: 0
                });
            }

            return {
                id: p.id,
                name: p.name,
                color: p.color,
                isBot: !!p.isBot,
                startIndex: pInfo.startIndex,
                tokens: tokens,
                finishedTokens: 0,
                rank: null
            };
        });

        this.currentTurnIndex = 0;
        this.consecutiveSixes = 0;
        this.state = 'WAITING_ROLL';
        this.validMoves = [];
        this.winners = [];
    }

    getCurrentPlayer() {
        return this.players[this.currentTurnIndex];
    }

    // Authoritative Dice Roll execution
    executeRoll(rolledValue) {
        if (this.state !== 'WAITING_ROLL') {
            return { error: 'Not in roll state', state: this.state };
        }

        this.diceValue = rolledValue;

        if (this.diceValue === 6) {
            this.consecutiveSixes++;
        } else {
            this.consecutiveSixes = 0;
        }

        // Rule: 3 consecutive sixes cancels turn
        if (this.consecutiveSixes === 3) {
            this.consecutiveSixes = 0;
            this.state = 'WAITING_ROLL';
            const timedOutColor = this.getCurrentPlayer().color;
            this.passTurn();
            return {
                dice: this.diceValue,
                threeSixesCanceled: true,
                validTokens: [],
                nextTurn: this.getCurrentPlayer().color
            };
        }

        this.calculateValidMoves();

        if (this.validMoves.length === 0) {
            this.state = 'WAITING_ROLL';
            const noMoveColor = this.getCurrentPlayer().color;
            this.passTurn();
            return {
                dice: this.diceValue,
                threeSixesCanceled: false,
                validTokens: [],
                noMoves: true,
                nextTurn: this.getCurrentPlayer().color
            };
        }

        this.state = 'SELECTING_TOKEN';
        return {
            dice: this.diceValue,
            threeSixesCanceled: false,
            validTokens: this.validMoves.map(m => m.token.id),
            noMoves: false
        };
    }

    calculateValidMoves() {
        const player = this.getCurrentPlayer();
        const steps = this.diceValue;
        this.validMoves = [];

        player.tokens.forEach(token => {
            if (token.state === 'FINISHED') return;

            // In yard: requires 6
            if (token.state === 'YARD') {
                if (steps === 6) {
                    this.validMoves.push({
                        token: token,
                        type: 'EXIT_YARD',
                        targetStepCount: 0
                    });
                }
                return;
            }

            // On track or home stretch: max step is 56
            const targetStep = token.stepCount + steps;
            if (targetStep <= 56) {
                this.validMoves.push({
                    token: token,
                    type: 'MOVE',
                    targetStepCount: targetStep
                });
            }
        });

        return this.validMoves;
    }

    // Authoritative Move Token execution
    executeMove(tokenId) {
        if (this.state !== 'SELECTING_TOKEN') {
            return { error: 'Not in token selection state', state: this.state };
        }

        const moveOption = this.validMoves.find(m => m.token.id === tokenId);
        if (!moveOption) {
            return { error: 'Illegal token move', tokenId: tokenId };
        }

        const player = this.getCurrentPlayer();
        const token = moveOption.token;
        let cutOccurred = false;
        let cutTokenInfo = null;
        let tokenFinished = false;

        if (moveOption.type === 'EXIT_YARD') {
            token.state = 'TRACK';
            token.stepCount = 0;
            token.trackIndex = player.startIndex;
        } else {
            token.stepCount = moveOption.targetStepCount;

            if (token.stepCount < 51) {
                token.state = 'TRACK';
                token.trackIndex = (player.startIndex + token.stepCount) % 52;
            } else if (token.stepCount >= 51 && token.stepCount < 56) {
                token.state = 'HOME_STRETCH';
                token.trackIndex = -1;
            } else if (token.stepCount === 56) {
                token.state = 'FINISHED';
                token.trackIndex = -1;
                player.finishedTokens++;
                tokenFinished = true;
            }
        }

        // Collision check
        if (token.state === 'TRACK' && !AuthoritativeEngine.isSafeIndex(token.trackIndex)) {
            this.players.forEach(otherPlayer => {
                if (otherPlayer.color === player.color) return;

                otherPlayer.tokens.forEach(otherToken => {
                    if (otherToken.state === 'TRACK' && otherToken.trackIndex === token.trackIndex) {
                        otherToken.state = 'YARD';
                        otherToken.trackIndex = -1;
                        otherToken.stepCount = 0;
                        cutOccurred = true;
                        cutTokenInfo = { color: otherPlayer.color, tokenId: otherToken.id };
                    }
                });
            });
        }

        // Win check
        let playerWon = false;
        if (player.finishedTokens === 4 && !player.rank) {
            this.winners.push(player.color);
            player.rank = this.winners.length;
            playerWon = true;

            if (this.winners.length >= this.players.length - 1) {
                this.state = 'GAME_OVER';
                return {
                    color: player.color,
                    tokenId: token.id,
                    stepCount: token.stepCount,
                    trackIndex: token.trackIndex,
                    tokenState: token.state,
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

        const bonusTurn = (this.diceValue === 6 || cutOccurred || tokenFinished);

        if (bonusTurn && !playerWon) {
            this.state = 'WAITING_ROLL';
            this.validMoves = [];
        } else {
            this.passTurn();
        }

        return {
            color: player.color,
            tokenId: token.id,
            stepCount: token.stepCount,
            trackIndex: token.trackIndex,
            tokenState: token.state,
            cutOccurred: cutOccurred,
            cutTokenInfo: cutTokenInfo,
            tokenFinished: tokenFinished,
            bonusTurn: bonusTurn,
            playerWon: playerWon,
            gameOver: false,
            nextTurn: this.getCurrentPlayer().color
        };
    }

    passTurn() {
        if (this.state === 'GAME_OVER') return;

        this.consecutiveSixes = 0;
        this.validMoves = [];
        this.state = 'WAITING_ROLL';

        let nextIdx = this.currentTurnIndex;
        for (let i = 0; i < this.players.length; i++) {
            nextIdx = (nextIdx + 1) % this.players.length;
            const candidate = this.players[nextIdx];
            if (candidate.finishedTokens < 4) {
                this.currentTurnIndex = nextIdx;
                break;
            }
        }
    }

    getStateSnapshot() {
        return {
            roomCode: this.roomCode,
            boardId: this.boardId,
            state: this.state,
            currentTurn: this.getCurrentPlayer().color,
            diceValue: this.diceValue,
            winners: this.winners,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                isBot: p.isBot,
                finishedTokens: p.finishedTokens,
                rank: p.rank,
                tokens: p.tokens.map(t => ({
                    id: t.id,
                    state: t.state,
                    trackIndex: t.trackIndex,
                    stepCount: t.stepCount
                }))
            }))
        };
    }
}

module.exports = AuthoritativeEngine;
