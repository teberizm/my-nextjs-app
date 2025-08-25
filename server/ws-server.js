// ws-server.js (authoritative server with phase timers & snapshots)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * Room structure:
 * roomId -> {
 *   players: Map<playerId, player>,
 *   sockets: Set<WebSocket>,
 *   settings: { nightDuration, dayDuration, voteDuration, cardDrawCount },
 *   state: {
 *     phase: 'LOBBY' | 'ROLE_REVEAL' | 'NIGHT' | 'NIGHT_RESULTS' | 'DEATH_ANNOUNCEMENT' | 'CARD_DRAWING' | 'DAY_DISCUSSION' | 'VOTE' | 'RESOLVE' | 'END',
 *     currentTurn: number,
 *     nightActions: Array<NightAction>,
 *     votes: Record<string,string>,
 *     deathsThisTurn: Array<Player>,
 *     deathLog: Array<Player>,
 *     bombTargets: string[],
 *     playerNotes: Record<string, string[]>,
 *     game: { startedAt: Date, endedAt?: Date, winningSide?: string } | null,
 *     phaseEndsAt: number // epoch ms (authoritative per phase)
 *   },
 *   timer: NodeJS.Timeout | null
 * }
 */

const rooms = new Map();

/* ---------------- Helpers ---------------- */
const now = () => Date.now();

function toPlain(obj) {
  // Deep clone + convert Date to ISO for JSON
  return JSON.parse(JSON.stringify(obj, (k, v) => (v instanceof Date ? v.toISOString() : v)));
}

function broadcast(room, type, payload = {}) {
  const message = JSON.stringify({ type, payload, serverTime: now() });
  room.sockets.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function snapshotRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const players = Array.from(room.players.values());
  const state = {
    ...room.state,
    players, // include players in snapshot for convenience
  };
  return toPlain(state);
}

function broadcastSnapshot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const safeState = snapshotRoom(roomId);
  broadcast(room, 'STATE_SNAPSHOT', { roomId, state: safeState });
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function startPhase(roomId, phase, durationSec) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimer(room);

  // Reset per-phase containers when needed
  if (phase === 'NIGHT') {
    room.state.nightActions = [];
    room.state.deathsThisTurn = [];
  } else if (phase === 'NIGHT_RESULTS') {
    // nothing here
  }

  room.state.phase = phase;
  room.state.phaseEndsAt = now() + Math.max(0, durationSec) * 1000;

  broadcast(room, 'PHASE_CHANGED', {
    phase,
    phaseEndsAt: room.state.phaseEndsAt,
  });
  broadcastSnapshot(roomId);

  if (durationSec > 0) {
    room.timer = setTimeout(() => {
      room.timer = null;
      advancePhase(roomId);
    }, durationSec * 1000 + 50);
  } else {
    // immediate advance for zero-duration phases is caller's choice
  }
}

// Minimal, authoritative phase progression
function advancePhase(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const settings = room.settings || { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 0 };

  switch (S.phase) {
    case 'ROLE_REVEAL':
      startPhase(roomId, 'NIGHT', settings.nightDuration);
      break;

    case 'NIGHT':
      // TODO: Process night actions here (block/kill/revive/bombs/notes)
      startPhase(roomId, 'NIGHT_RESULTS', 5);
      break;

    case 'NIGHT_RESULTS':
      startPhase(roomId, 'DEATH_ANNOUNCEMENT', 5);
      break;

    case 'DEATH_ANNOUNCEMENT':
      if ((settings.cardDrawCount || 0) > 0) {
        startPhase(roomId, 'CARD_DRAWING', 0);
      } else {
        startPhase(roomId, 'DAY_DISCUSSION', settings.dayDuration);
      }
      break;

    case 'CARD_DRAWING':
      startPhase(roomId, 'DAY_DISCUSSION', settings.dayDuration);
      break;

    case 'DAY_DISCUSSION':
      startPhase(roomId, 'VOTE', settings.voteDuration);
      break;

    case 'VOTE':
      // TODO: tally votes into deathsThisTurn/deathLog if needed
      startPhase(roomId, 'RESOLVE', 3);
      break;

    case 'RESOLVE':
      // TODO: win condition check → END or next night
      S.currentTurn = (S.currentTurn || 1) + 1;
      startPhase(roomId, 'NIGHT', settings.nightDuration);
      break;

    default:
      break;
  }
}

/* -------------- WebSocket events ------------ */
wss.on('connection', (ws) => {
  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid WS message (not JSON):', e);
      return;
    }

    const { type, payload, roomId, playerId } = data || {};
    const rid = roomId || ws.roomId;

    switch (type) {
      case 'JOIN_ROOM': {
        const { roomId: joinRoomId, player } = payload || {};
        if (!joinRoomId || !player || !player.id) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'JOIN_ROOM payload invalid' } }));
          return;
        }
        ws.roomId = joinRoomId;
        ws.playerId = player.id;

        if (!rooms.has(joinRoomId)) {
          rooms.set(joinRoomId, {
            players: new Map(),
            sockets: new Set(),
            settings: { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 0 },
            state: {
              phase: 'LOBBY',
              currentTurn: 1,
              nightActions: [],
              votes: {},
              deathsThisTurn: [],
              deathLog: [],
              bombTargets: [],
              playerNotes: {},
              game: null,
              phaseEndsAt: 0,
            },
            timer: null,
          });
        }

        const room = rooms.get(joinRoomId);
        room.players.set(player.id, player);
        room.sockets.add(ws);

        ws.send(JSON.stringify({ type: 'ROOM_JOINED', payload: { roomId: joinRoomId } }));

        // broadcast player list
        const players = Array.from(room.players.values());
        broadcast(room, 'PLAYER_LIST_UPDATED', { players, newPlayer: player });
        // send snapshot to the new joiner
        const snap = snapshotRoom(joinRoomId);
        ws.send(JSON.stringify({ type: 'STATE_SNAPSHOT', payload: { roomId: joinRoomId, state: snap }, serverTime: now() }));
        break;
      }

      case 'KICK_PLAYER': {
        if (!rid) return;
        const room = rooms.get(rid);
        if (!room) return;

        const targetId = payload && payload.playerId;
        if (!targetId) return;

        const removed = room.players.get(targetId);
        const targetSocket = Array.from(room.sockets).find((s) => s.playerId === targetId);

        if (targetSocket) {
          targetSocket.send(JSON.stringify({ type: 'PLAYER_KICKED', payload: { playerId: targetId } }));
          try { targetSocket.close(); } catch (_) {}
        }

        room.players.delete(targetId);
        broadcast(room, 'PLAYER_LIST_UPDATED', { players: Array.from(room.players.values()), removedPlayer: removed });
        break;
      }

      case 'GAME_STARTED': {
        const room = rooms.get(rid);
        if (!room) return;
        if (room.state.phase !== 'LOBBY') {
          // already started; ignore duplicate
          break;
        }
        // store settings from owner
        if (payload && payload.settings) {
          room.settings = {
            ...room.settings,
            ...payload.settings,
          };
        }

        // reset state
        room.state.game = { startedAt: new Date() };
        room.state.currentTurn = 1;
        room.state.nightActions = [];
        room.state.votes = {};
        room.state.deathsThisTurn = [];
        room.state.deathLog = [];
        room.state.bombTargets = [];
        room.state.playerNotes = {};

        // move to ROLE_REVEAL with 10s
        startPhase(rid, 'ROLE_REVEAL', 10);

        // Also broadcast GAME_STARTED for clients that listen for it
        broadcast(room, 'GAME_STARTED', payload || {});
        break;
      }

      case 'REQUEST_SNAPSHOT': {
        const room = rooms.get(rid);
        if (!room) return;
        const snap = snapshotRoom(rid);
        ws.send(JSON.stringify({ type: 'STATE_SNAPSHOT', payload: { roomId: rid, state: snap }, serverTime: now() }));
        break;
      }

      // Client-driven phase changes are ignored (server is authoritative).
      case 'PHASE_CHANGED':
        // ignore
        break;

      case 'NIGHT_ACTION_SUBMITTED': {
        const room = rooms.get(rid);
        if (!room) return;
        const action = payload && payload.action;
        if (!action) return;

        const fixed = {
          ...action,
          playerId: (ws.playerId || playerId || action.playerId),
          timestamp: new Date(),
        };

        // Replace or add action per-player
        room.state.nightActions = [
          ...room.state.nightActions.filter(a => a.playerId !== fixed.playerId),
          fixed,
        ];

        broadcast(room, 'NIGHT_ACTIONS_UPDATED', {
          actions: toPlain(room.state.nightActions),
        });
        broadcastSnapshot(rid);
        break;
      }

      case 'SUBMIT_VOTE': {
        const room = rooms.get(rid);
        if (!room) return;
        const { voterId, targetId } = payload || {};
        if (!voterId) return;
        room.state.votes[voterId] = targetId;

        // Optionally: if all alive voted, you can fast-forward by clearing timer and calling advancePhase
        broadcast(room, 'VOTES_UPDATED', { votes: room.state.votes });
        broadcastSnapshot(rid);
        break;
      }

      default:
        // Unknown events ignored
        break;
    }
  });

  ws.on('close', () => {
    const { roomId, playerId } = ws;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const removed = room.players.get(playerId);

      room.players.delete(playerId);
      room.sockets.delete(ws);

      broadcast(room, 'PLAYER_LIST_UPDATED', { players: Array.from(room.players.values()), removedPlayer: removed });

      if (room.players.size === 0) {
        clearTimer(room);
        rooms.delete(roomId);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WS error:', err && err.message ? err.message : err);
  });
});

/* ---------------- Heartbeat ---------------- */
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (_) {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

/* ---------------- HTTP ---------------- */
app.get('/', (req, res) => res.send('Socket server OK'));

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ WebSocket sunucu çalışıyor http://0.0.0.0:3001');
});
