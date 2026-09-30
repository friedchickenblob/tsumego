import { BOARD_SIZE as N, EMPTY, BLACK, WHITE } from './shared/constants.js';
import { SERVER_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), queue: $('queue'), game: $('game') };
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const COLOR_NAME = { [BLACK]: 'Black', [WHITE]: 'White' };
const TERRITORY_FILL = { [BLACK]: 'rgba(30, 110, 240, 0.45)', [WHITE]: 'rgba(230, 50, 50, 0.45)' };

let ws = null;
let game = null; // state of the current match, null when in menus
let hover = -1;
let cell = 0;    // grid spacing in CSS pixels; the board has a one-cell margin

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  if (name === 'game') resize();
}

// ---- Networking -------------------------------------------------------------

function connect() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) return resolve(ws);
    const sock = new WebSocket(SERVER_URL);
    sock.onopen = () => { ws = sock; resolve(sock); };
    sock.onerror = () => reject(new Error('Could not reach the game server.'));
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      const wasPlaying = game && !game.over;
      game = null;
      show('menu');
      if (wasPlaying) setStatus('Lost connection to the server.');
    };
    sock.onmessage = (e) => onMessage(JSON.parse(e.data));
  });
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onMessage(msg) {
  switch (msg.t) {
    case 'queued': show('queue'); break;
    case 'match': startMatch(msg); break;
    case 'state': onState(msg); break;
    case 'error': if (game) setMessage(msg.message, true); break;
  }
}

// ---- Menus ------------------------------------------------------------------

const nameInput = $('name');
try { nameInput.value = localStorage.getItem('tsumegoName') || ''; } catch {}

function setStatus(text) { $('menu-status').textContent = text; }

$('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  try { localStorage.setItem('tsumegoName', name); } catch {}
  setStatus('Connecting…');
  $('play').disabled = true;
  try {
    await connect();
    setStatus('');
    send({ t: 'join', name, mode: 'duel' });
  } catch (err) {
    setStatus(err.message);
  } finally {
    $('play').disabled = false;
  }
});

$('cancel-queue').addEventListener('click', () => {
  send({ t: 'leaveQueue' });
  show('menu');
});

$('leave').addEventListener('click', () => {
  send({ t: 'leaveMatch' });
  game = null;
  show('menu');
});

$('pass').addEventListener('click', () => {
  if (game && !game.over && game.turn === game.color) send({ t: 'pass' });
});

// ---- Match state ------------------------------------------------------------

function startMatch(msg) {
  if (msg.color !== BLACK && msg.color !== WHITE) {
    // An older server (e.g. the tank game) answered; it can't play Go.
    setStatus('The server is running an old version of the game. Restart or redeploy it.');
    ws?.close();
    return;
  }
  game = {
    you: msg.you,
    color: msg.color,
    players: msg.players,
    board: new Array(N * N).fill(EMPTY),
    turn: BLACK,
    captures: { [BLACK]: 0, [WHITE]: 0 },
    last: null,
    over: false,
    result: null,
  };
  hover = -1;
  $('leave').classList.add('hidden');
  show('game');
  render();
}

function onState(msg) {
  Object.assign(game, {
    board: [...msg.board].map(Number),
    turn: msg.turn,
    captures: msg.captures,
    last: msg.last,
    over: msg.over,
    result: msg.result || null,
  });
  $('leave').classList.toggle('hidden', !game.over);
  render();
}

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ---- Rendering --------------------------------------------------------------

function render() {
  renderScoreboard();
  renderStatus();
  $('pass').disabled = game.over || game.turn !== game.color;
  draw();
}

function renderScoreboard() {
  const board = $('scoreboard');
  board.textContent = '';
  const res = game.result;
  for (const p of [...game.players].sort((a, b) => a.color - b.color)) {
    const side = document.createElement('div');
    side.className = 'side' + (!game.over && game.turn === p.color ? ' active' : '');
    const stone = document.createElement('span');
    stone.className = 'stone ' + (p.color === BLACK ? 'black' : 'white');
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === game.you ? ' (you)' : '');
    side.append(stone, name);
    const sub = document.createElement('span');
    sub.className = 'sub-score';
    if (res && res.score) {
      const total = document.createElement('span');
      total.className = 'score';
      total.textContent = res.score[p.color];
      sub.textContent = `${res.territory[p.color]} territory + ${game.captures[p.color]} captured`;
      side.append(total);
    } else {
      sub.textContent = `${game.captures[p.color]} captured`;
    }
    side.append(sub);
    board.append(side);
  }
}

function renderStatus() {
  const res = game.result;
  if (res) {
    if (res.reason === 'forfeit') {
      setMessage(res.winner === game.color ? 'Your opponent left. You win!' : 'Game over.');
    } else if (!res.winner) {
      setMessage('Both players passed. The game is a draw.');
    } else {
      const loser = res.winner === BLACK ? WHITE : BLACK;
      const who = res.winner === game.color ? 'You win' : 'You lose';
      setMessage(`Both players passed. ${who}: ${COLOR_NAME[res.winner]} ${res.score[res.winner]}, ${COLOR_NAME[loser]} ${res.score[loser]}.`);
    }
    return;
  }
  const mine = game.turn === game.color;
  const passed = game.last && game.last.pass ? ` ${COLOR_NAME[game.last.color]} passed.` : '';
  setMessage((mine ? `Your turn (${COLOR_NAME[game.color]}).` : `Waiting for opponent (${COLOR_NAME[game.turn]} to move).`) + passed);
}

function resize() {
  const stage = $('stage');
  const size = Math.max(200, Math.floor(0.9 * Math.min(stage.clientWidth, stage.clientHeight)));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = canvas.style.height = size + 'px';
  canvas.width = canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = size / (N + 1);
  draw();
}
window.addEventListener('resize', resize);

const pos = (i) => [cell + (i % N) * cell, cell + Math.floor(i / N) * cell];

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function draw() {
  if (!game) return;
  const size = canvas.clientWidth;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#e8b96a';
  ctx.fillRect(0, 0, size, size);

  // Territory highlights (only once the game has been scored).
  if (game.result && game.result.owner) {
    game.result.owner.forEach((o, i) => {
      if (!o) return;
      const [x, y] = pos(i);
      ctx.fillStyle = TERRITORY_FILL[o];
      ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
    });
  }

  // Grid and star points.
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < N; k++) {
    const p = cell + k * cell;
    ctx.moveTo(cell, p); ctx.lineTo(cell + (N - 1) * cell, p);
    ctx.moveTo(p, cell); ctx.lineTo(p, cell + (N - 1) * cell);
  }
  ctx.stroke();
  ctx.fillStyle = '#000';
  for (const [sx, sy] of [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]) {
    circle(cell + sx * cell, cell + sy * cell, cell * 0.08);
    ctx.fill();
  }

  // Stones.
  const r = cell * 0.46;
  game.board.forEach((v, i) => {
    if (!v) return;
    const [x, y] = pos(i);
    circle(x, y, r);
    ctx.fillStyle = v === BLACK ? '#111' : '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Last-move marker.
  if (game.last && game.last.i !== undefined) {
    const [x, y] = pos(game.last.i);
    circle(x, y, r * 0.4);
    ctx.strokeStyle = game.board[game.last.i] === BLACK ? '#fff' : '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Hover preview.
  if (!game.over && game.turn === game.color && hover >= 0 && game.board[hover] === EMPTY) {
    const [x, y] = pos(hover);
    ctx.globalAlpha = 0.5;
    circle(x, y, r);
    ctx.fillStyle = game.color === BLACK ? '#111' : '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function pointAt(e) {
  const rect = canvas.getBoundingClientRect();
  const gx = Math.round((e.clientX - rect.left) / cell) - 1;
  const gy = Math.round((e.clientY - rect.top) / cell) - 1;
  return gx >= 0 && gx < N && gy >= 0 && gy < N ? gy * N + gx : -1;
}

canvas.addEventListener('mousemove', (e) => {
  const i = pointAt(e);
  if (i !== hover) { hover = i; draw(); }
});
canvas.addEventListener('mouseleave', () => { hover = -1; draw(); });
canvas.addEventListener('click', (e) => {
  if (!game || game.over || game.turn !== game.color) return;
  const i = pointAt(e);
  if (i >= 0) send({ t: 'move', i });
});
