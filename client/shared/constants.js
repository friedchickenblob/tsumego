// Constants shared by the browser client and the Node server.

export const BOARD_SIZE = 9;

// Stone / owner codes used in board arrays.
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

// Matchmaking keeps one queue per mode; only the 1v1 duel is enabled today.
export const MODES = Object.freeze({
  duel: { playersPerMatch: 2 },
});
