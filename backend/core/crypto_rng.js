// Cryptographically Secure Fair Dice Generator
const crypto = require('crypto');

class CryptoRNG {
    /**
     * Generates a cryptographically secure random integer between 1 and 6 (inclusive).
     * @returns {number} 1 to 6
     */
    static rollDice() {
        return crypto.randomInt(1, 7);
    }

    /**
     * Generates a unique 6-digit numeric room code for private rooms.
     * @returns {string} 6-digit string
     */
    static generateRoomCode() {
        return crypto.randomInt(100000, 999999).toString();
    }

    /**
     * Generates a unique client ID.
     * @returns {string} Client ID
     */
    static generateClientId() {
        return 'c_' + crypto.randomBytes(4).toString('hex');
    }
}

module.exports = CryptoRNG;
