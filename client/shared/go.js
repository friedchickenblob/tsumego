// Go rules: captures, suicide, simple ko, and Japanese-style territory scoring.
// Boards are flat arrays of BOARD_SIZE*BOARD_SIZE cells holding EMPTY/BLACK/WHITE.
import { BOARD_SIZE as N, EMPTY, BLACK, WHITE } from './constants.js';

export const other = (color) => (color === BLACK ? WHITE : BLACK);
export const emptyBoard = () => new Array(N * N).fill(EMPTY);

function neighbors(i) {
  const x = i % N, y = (i - x) / N;
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < N - 1) out.push(i + 1);
  if (y > 0) out.push(i - N);
  if (y < N - 1) out.push(i + N);
  return out;
}

// Flood-fill the connected group of same-valued cells containing i.
function region(board, i) {
  const value = board[i];
  const cells = [i];
  const seen = new Set(cells);
  for (let k = 0; k < cells.length; k++) {
    for (const n of neighbors(cells[k])) {
      if (board[n] === value && !seen.has(n)) { seen.add(n); cells.push(n); }
    }
  }
  return cells;
}

const hasLiberty = (board, group) => group.some((c) => neighbors(c).some((n) => board[n] === EMPTY));

// Attempt to place `color` at index i. `koBoard` is the position before the
// opponent's last move (playing back into it would repeat a position).
// Returns { board, captured } or { error }.
export function tryMove(board, i, color, koBoard) {
  if (!Number.isInteger(i) || i < 0 || i >= N * N) return { error: 'Off the board.' };
  if (board[i] !== EMPTY) return { error: 'That point is occupied.' };
  const next = board.slice();
  next[i] = color;
  let captured = 0;
  for (const n of neighbors(i)) {
    if (next[n] === other(color)) {
      const group = region(next, n);
      if (!hasLiberty(next, group)) {
        for (const c of group) next[c] = EMPTY;
        captured += group.length;
      }
    }
  }
  if (!hasLiberty(next, region(next, i))) return { error: 'Suicide is not allowed.' };
  if (koBoard && next.every((v, k) => v === koBoard[k])) return { error: 'Ko: you cannot repeat the previous position.' };
  return { board: next, captured };
}

// Territory: an empty region touching only one color (and the edge) belongs to
// that color. Regions touching both colors, or neither, count for nobody.
// Score = territory + prisoners (Japanese), no komi.
export function scoreGame(board, captures) {
  const owner = new Array(N * N).fill(EMPTY);
  const territory = { [BLACK]: 0, [WHITE]: 0 };
  const done = new Set();
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== EMPTY || done.has(i)) continue;
    const cells = region(board, i);
    const borders = new Set();
    for (const c of cells) {
      done.add(c);
      for (const n of neighbors(c)) if (board[n] !== EMPTY) borders.add(board[n]);
    }
    if (borders.size === 1) {
      const color = [...borders][0];
      for (const c of cells) owner[c] = color;
      territory[color] += cells.length;
    }
  }
  const score = {
    [BLACK]: territory[BLACK] + captures[BLACK],
    [WHITE]: territory[WHITE] + captures[WHITE],
  };
  const winner = score[BLACK] === score[WHITE] ? EMPTY : score[BLACK] > score[WHITE] ? BLACK : WHITE;
  return { owner, territory, score, winner };
}
