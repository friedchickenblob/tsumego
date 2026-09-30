// WebSocket game server: connection handling, matchmaking and the tick loop.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { MODES } from '../client/shared/constants.js';
import { Match } from './match.js';

const PORT = Number(process.env.PORT) || 8080;
const MAX_NAME = 16;

let nextConnId = 1;
let nextMatchId = 1;
const queues = new Map(Object.keys(MODES).map((m) => [m, []])); // mode -> waiting conns
const matches = new Set();

function enqueue(conn, mode) {
  if (conn.match || !queues.has(mode)) return;
  dequeue(conn);
  const queue = queues.get(mode);
  queue.push(conn);
  conn.queuedFor = mode;
  const needed = MODES[mode].playersPerMatch;
  if (queue.length >= needed) {
    const group = queue.splice(0, needed);
    for (const c of group) c.queuedFor = null;
    const match = new Match(nextMatchId++, mode, MODES[mode], group, (m) => matches.delete(m));
    matches.add(match);
    console.log(`match ${match.id} started: ${group.map((c) => c.name).join(' vs ')}`);
  } else {
    conn.send({ t: 'queued', mode });
  }
}

function dequeue(conn) {
  if (!conn.queuedFor) return;
  const queue = queues.get(conn.queuedFor);
  const i = queue.indexOf(conn);
  if (i >= 0) queue.splice(i, 1);
  conn.queuedFor = null;
}

function handleMessage(conn, msg) {
  switch (msg.t) {
    case 'join': {
      const name = String(msg.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
      conn.name = name || 'Player';
      enqueue(conn, typeof msg.mode === 'string' ? msg.mode : 'duel');
      break;
    }
    case 'leaveQueue':
      dequeue(conn);
      break;
    case 'move':
      conn.match?.handleMove(conn, { i: msg.i });
      break;
    case 'pass':
      conn.match?.handleMove(conn, { pass: true });
      break;
    case 'leaveMatch':
      conn.match?.removePlayer(conn);
      break;
  }
}

const server = http.createServer((req, res) => {
  // Plain HTTP endpoint for health checks.
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`ok ${matches.size} matches, ${[...queues.values()].reduce((n, q) => n + q.length, 0)} queued\n`);
});

const wss = new WebSocketServer({ server, maxPayload: 1024 });

wss.on('connection', (ws) => {
  const conn = {
    id: nextConnId++,
    name: 'Player',
    ws,
    match: null,
    queuedFor: null,
    sendRaw(data) { if (ws.readyState === ws.OPEN) ws.send(data); },
    send(msg) { this.sendRaw(JSON.stringify(msg)); },
  };
  conn.send({ t: 'hello', id: conn.id });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg && typeof msg === 'object') handleMessage(conn, msg);
  });
  ws.on('close', () => {
    dequeue(conn);
    conn.match?.removePlayer(conn);
  });
});

// Drop connections that stop answering pings.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`tsumego server listening on :${PORT}`));
