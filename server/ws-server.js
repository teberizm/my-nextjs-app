const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory room and player tracking
// roomId -> { players: Map<playerId, player>, sockets: Set<ws> }
const rooms = new Map();

/* -------------------- Helpers -------------------- */
function broadcastToRoom(roomId, dataObj) {
  const room = rooms.get(roomId);
  if (!room) return;
  const message = JSON.stringify({
    ...dataObj,
    roomId,
  });
  room.sockets.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastPlayerList(roomId, options = {}) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.players.values());
  broadcastToRoom(roomId, {
    type: 'PLAYER_LIST_UPDATED',
    payload: {
      players,
      ...(options.newPlayer ? { newPlayer: options.newPlayer } : {}),
      ...(options.removedPlayer ? { removedPlayer: options.removedPlayer } : {}),
    },
  });
}

/* -------------------- Connection -------------------- */
wss.on('connection', function connection(ws) {
  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', function incoming(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid message (not JSON):', e);
      return;
    }

    const { type, payload, roomId, playerId } = data || {};
    const effectiveRoomId = roomId || ws.roomId;

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
          rooms.set(joinRoomId, { players: new Map(), sockets: new Set() });
        }

        const room = rooms.get(joinRoomId);
        room.players.set(player.id, player);
        room.sockets.add(ws);

        ws.send(JSON.stringify({ type: 'ROOM_JOINED', payload: { roomId: joinRoomId } }));
        broadcastPlayerList(joinRoomId, { newPlayer: player });
        break;
      }

      case 'KICK_PLAYER': {
        if (!effectiveRoomId) return;
        const room = rooms.get(effectiveRoomId);
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
        broadcastPlayerList(effectiveRoomId, { removedPlayer: removed });
        break;
      }

      case 'GAME_STARTED': {
        // Mesajdaki roomId yerine bağlandığı odayı kullan
        const targetRoomId = ws.roomId || roomId;
        const room = rooms.get(targetRoomId);
        if (!room) return;

        const message = JSON.stringify({ type: 'GAME_STARTED', payload });
        room.sockets.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
        break;
      }

      case 'STATE_SNAPSHOT': {
        if (!effectiveRoomId) return;
        // OWNER’ın gönderdiği otoritatif state (roller, faz, süre vs.)
        broadcastToRoom(effectiveRoomId, {
          type: 'STATE_SNAPSHOT',
          payload,
        });
        break;
      }

      case 'PHASE_CHANGED': {
        if (!effectiveRoomId) return;
        broadcastToRoom(effectiveRoomId, {
          type: 'PHASE_CHANGED',
          payload,
        });
        break;
      }

      case 'VOTE_CAST': {
        if (!effectiveRoomId) return;
        broadcastToRoom(effectiveRoomId, {
          type: 'VOTE_CAST',
          payload,
        });
        break;
      }

      case 'NIGHT_ACTION_UPDATED': {
        if (!effectiveRoomId) return;
        broadcastToRoom(effectiveRoomId, {
          type: 'NIGHT_ACTION_UPDATED',
          payload,
        });
        break;
      }

      default: {
        // Unknown events → ignore
        break;
      }
    }
  });

  ws.on('close', () => {
    const { roomId, playerId } = ws;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const removed = room.players.get(playerId);

      room.players.delete(playerId);
      room.sockets.delete(ws);

      broadcastPlayerList(roomId, { removedPlayer: removed });

      if (room.players.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WS error:', err && err.message ? err.message : err);
  });
});

/* -------------------- Heartbeat -------------------- */
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

wss.on('close', function close() {
  clearInterval(interval);
});

/* -------------------- HTTP -------------------- */
app.get('/', (req, res) => res.send('Socket server OK'));

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ WebSocket sunucu çalışıyor http://0.0.0.0:3001');
});
