// One running game of Go between two players. Black is chosen at random.
import { BLACK, WHITE, EMPTY } from '../client/shared/constants.js';
import { emptyBoard, other, tryMove, scoreGame } from '../client/shared/go.js';

export class Match {
  constructor(id, mode, modeConfig, conns, onEnd) {
    this.id = id;
    this.mode = mode;
    this.onEnd = onEnd;

    const colors = Math.random() < 0.5 ? [BLACK, WHITE] : [WHITE, BLACK];
    this.players = conns.map((conn, i) => ({
      conn, id: conn.id, name: conn.name, color: colors[i], connected: true,
    }));

    this.board = emptyBoard();
    this.prevBoard = null;      // position before the last move, for the ko rule
    this.turn = BLACK;
    this.passes = 0;            // consecutive passes
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
    this.last = null;           // { i } or { pass: true }
    this.over = false;
    this.result = null;

    for (const p of this.players) {
      p.conn.match = this;
      p.conn.send({
        t: 'match',
        you: p.id,
        color: p.color,
        players: this.players.map((q) => ({ id: q.id, name: q.name, color: q.color })),
      });
    }
    this.sendState();
  }

  sendState(extra = {}) {
    const data = JSON.stringify({
      t: 'state',
      board: this.board.join(''),
      turn: this.turn,
      captures: this.captures,
      last: this.last,
      over: this.over,
      ...extra,
    });
    for (const p of this.players) if (p.connected) p.conn.sendRaw(data);
  }

  playerFor(conn) { return this.players.find((q) => q.conn === conn); }

  handleMove(conn, msg) {
    const p = this.playerFor(conn);
    if (!p || this.over) return;
    if (p.color !== this.turn) return conn.send({ t: 'error', message: 'Not your turn.' });

    if (msg.pass) {
      this.passes++;
      this.prevBoard = this.board;
      this.last = { pass: true, color: p.color };
      if (this.passes >= 2) return this.finish();
    } else {
      const res = tryMove(this.board, msg.i, p.color, this.prevBoard);
      if (res.error) return conn.send({ t: 'error', message: res.error });
      this.prevBoard = this.board;
      this.board = res.board;
      this.captures[p.color] += res.captured;
      this.passes = 0;
      this.last = { i: msg.i, color: p.color };
    }
    this.turn = other(this.turn);
    this.sendState();
  }

  finish() {
    this.over = true;
    const r = scoreGame(this.board, this.captures);
    this.result = { reason: 'score', ...r };
    this.sendState({ result: this.result });
    this.close();
  }

  removePlayer(conn) {
    const p = this.playerFor(conn);
    if (!p) return;
    conn.match = null;
    if (this.over) return;
    p.connected = false;
    this.over = true;
    this.result = { reason: 'forfeit', winner: other(p.color) };
    this.sendState({ result: this.result });
    this.close();
  }

  close() {
    for (const q of this.players) if (q.conn.match === this) q.conn.match = null;
    this.onEnd(this);
  }
}
