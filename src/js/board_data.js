// Ludo X Board Geometry and Coordinate System
// 15x15 Grid with 52 common tracks, 8 safe stars, 4 yards and 4 home stretches.

const BOARD_DATA = {
    GRID_SIZE: 15,

    PLAYERS: {
        RED: {
            id: 'red',
            name: 'Red (লাল)',
            startIndex: 0,
            homeEntryIndex: 51,
            colorHex: '#eb1c24', // Ludo King Official Red
            colorGlow: 'rgba(235, 28, 36, 0.6)',
            yardCoords: [
                { col: 1.5, row: 10.5 },
                { col: 3.5, row: 10.5 },
                { col: 1.5, row: 12.5 },
                { col: 3.5, row: 12.5 }
            ],
            homeStretch: [
                { col: 7, row: 13 },
                { col: 7, row: 12 },
                { col: 7, row: 11 },
                { col: 7, row: 10 },
                { col: 7, row: 9 }
            ],
            centerGoal: { col: 7.5, row: 8.5 }
        },
        GREEN: {
            id: 'green',
            name: 'Green (সবুজ)',
            startIndex: 13,
            homeEntryIndex: 11,
            colorHex: '#02a04b', // Ludo King Official Green
            colorGlow: 'rgba(2, 160, 75, 0.6)',
            yardCoords: [
                { col: 1.5, row: 1.5 },
                { col: 3.5, row: 1.5 },
                { col: 1.5, row: 3.5 },
                { col: 3.5, row: 3.5 }
            ],
            homeStretch: [
                { col: 1, row: 7 },
                { col: 2, row: 7 },
                { col: 3, row: 7 },
                { col: 4, row: 7 },
                { col: 5, row: 7 }
            ],
            centerGoal: { col: 6.5, row: 7.5 }
        },
        YELLOW: {
            id: 'yellow',
            name: 'Yellow (হলুদ)',
            startIndex: 26,
            homeEntryIndex: 24,
            colorHex: '#ffe013', // Ludo King Official Yellow
            colorGlow: 'rgba(255, 224, 19, 0.6)',
            yardCoords: [
                { col: 10.5, row: 1.5 },
                { col: 12.5, row: 1.5 },
                { col: 10.5, row: 3.5 },
                { col: 12.5, row: 3.5 }
            ],
            homeStretch: [
                { col: 7, row: 1 },
                { col: 7, row: 2 },
                { col: 7, row: 3 },
                { col: 7, row: 4 },
                { col: 7, row: 5 }
            ],
            centerGoal: { col: 7.5, row: 6.5 }
        },
        BLUE: {
            id: 'blue',
            name: 'Blue (নীল)',
            startIndex: 39,
            homeEntryIndex: 37,
            colorHex: '#22409a', // Ludo King Official Royal Blue
            colorGlow: 'rgba(34, 64, 154, 0.6)',
            yardCoords: [
                { col: 10.5, row: 10.5 },
                { col: 12.5, row: 10.5 },
                { col: 10.5, row: 12.5 },
                { col: 12.5, row: 12.5 }
            ],
            homeStretch: [
                { col: 13, row: 7 },
                { col: 12, row: 7 },
                { col: 11, row: 7 },
                { col: 10, row: 7 },
                { col: 9, row: 7 }
            ],
            centerGoal: { col: 8.5, row: 7.5 }
        }
    },

    // 52 Common Track Coordinates (Clockwise order starting from Red start cell)
    TRACK: [
        // 0..4: Bottom arm col 6 going up
        { col: 6, row: 13 }, { col: 6, row: 12 }, { col: 6, row: 11 }, { col: 6, row: 10 }, { col: 6, row: 9 },
        // 5..10: Left arm row 8 going left
        { col: 5, row: 8 }, { col: 4, row: 8 }, { col: 3, row: 8 }, { col: 2, row: 8 }, { col: 1, row: 8 }, { col: 0, row: 8 },
        // 11..12: Left edge going up
        { col: 0, row: 7 }, { col: 0, row: 6 },
        // 13..17: Left arm row 6 going right (Green start at 13)
        { col: 1, row: 6 }, { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 }, { col: 5, row: 6 },
        // 18..23: Top arm col 6 going up
        { col: 6, row: 5 }, { col: 6, row: 4 }, { col: 6, row: 3 }, { col: 6, row: 2 }, { col: 6, row: 1 }, { col: 6, row: 0 },
        // 24..25: Top edge going right
        { col: 7, row: 0 }, { col: 8, row: 0 },
        // 26..30: Top arm col 8 going down (Yellow start at 26)
        { col: 8, row: 1 }, { col: 8, row: 2 }, { col: 8, row: 3 }, { col: 8, row: 4 }, { col: 8, row: 5 },
        // 31..36: Right arm row 6 going right
        { col: 9, row: 6 }, { col: 10, row: 6 }, { col: 11, row: 6 }, { col: 12, row: 6 }, { col: 13, row: 6 }, { col: 14, row: 6 },
        // 37..38: Right edge going down
        { col: 14, row: 7 }, { col: 14, row: 8 },
        // 39..43: Right arm row 8 going left (Blue start at 39)
        { col: 13, row: 8 }, { col: 12, row: 8 }, { col: 11, row: 8 }, { col: 10, row: 8 }, { col: 9, row: 8 },
        // 44..49: Bottom arm col 8 going down
        { col: 8, row: 9 }, { col: 8, row: 10 }, { col: 8, row: 11 }, { col: 8, row: 12 }, { col: 8, row: 13 }, { col: 8, row: 14 },
        // 50..51: Bottom edge going left
        { col: 7, row: 14 }, { col: 6, row: 14 }
    ],

    // 8 Safe Star Indices on the 52-cell track
    SAFE_STAR_INDICES: [0, 8, 13, 21, 26, 34, 39, 47],

    isSafeIndex(trackIdx) {
        return this.SAFE_STAR_INDICES.includes(trackIdx);
    },

    // Convert (col, row) in 15x15 space to Canvas pixels (x, y)
    gridToPixels(col, row, canvasSize) {
        const cellSize = canvasSize / this.GRID_SIZE;
        return {
            x: (col + 0.5) * cellSize,
            y: (row + 0.5) * cellSize,
            cellSize: cellSize
        };
    }
};

window.BOARD_DATA = BOARD_DATA;
