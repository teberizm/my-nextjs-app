const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory room and player tracking
const rooms = new Map(); // roomId -> { players: Map<playerId, player>, sockets: Set<ws> }

function broadcastPlayerList(roomId, options = {}) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.players.values());
  const message = JSON.stringify({
    type: 'PLAYER_LIST_UPDATED',
    payload: {
      players,
      ...(options.newPlayer ? { newPlayer: options.newPlayer } : {}),
      ...(options.removedPlayer ? { removedPlayer: options.removedPlayer } : {}),
    },
  });
  room.sockets.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid message', e);
      return;
    }

    const { type, payload, roomId, playerId } = data;

    switch (type) {
      case 'JOIN_ROOM': {
        const { roomId: joinRoomId, player } = payload;
        ws.roomId = joinRoomId;
        ws.playerId = player.id;
        if (!rooms.has(joinRoomId)) {
          rooms.set(joinRoomId, { players: new Map(), sockets: new Set() });
        }
        const room = rooms.get(joinRoomId);
        room.players.set(player.id, player);
        room.sockets.add(ws);

        ws.send(
          JSON.stringify({ type: 'ROOM_JOINED', payload: { roomId: joinRoomId } }),
        );

        broadcastPlayerList(joinRoomId, { newPlayer: player });
        break;
      }

      case 'KICK_PLAYER': {
        const room = rooms.get(roomId);
        if (!room) return;
        const targetId = payload.playerId;
        const removed = room.players.get(targetId);
        const targetSocket = Array.from(room.sockets).find((s) => s.playerId === targetId);
        if (targetSocket) {
          targetSocket.send(
            JSON.stringify({ type: 'PLAYER_KICKED', payload: { playerId: targetId } }),
          );
          targetSocket.close();
        }
        room.players.delete(targetId);
        broadcastPlayerList(roomId, { removedPlayer: removed });
        break;
      }

      case 'GAME_STARTED': {
        const room = rooms.get(roomId);
        if (!room) return;
        const message = JSON.stringify({ type: 'GAME_STARTED', payload });
        room.sockets.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
        break;
      }

      default:
        // Unknown events are ignored
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
      broadcastPlayerList(roomId, { removedPlayer: removed });
      if (room.players.size === 0) {
        rooms.delete(roomId);
      }
    }
  });
});

app.get('/', (req, res) => res.send('Socket server OK'));

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ WebSocket sunucu çalışıyor http://0.0.0.0:3001');
});

