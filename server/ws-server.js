const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 3001 });

const rooms = new Map();

function broadcast(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let player = null;

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch (e) {
      return;
    }
    switch (data.type) {
      case 'JOIN_ROOM': {
        currentRoom = data.payload.roomId;
        player = data.payload.player;
        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, { clients: [] });
        }
        const room = rooms.get(currentRoom);
        room.clients.push({ ws, player });
        ws.send(
          JSON.stringify({ type: 'ROOM_JOINED', payload: { roomId: currentRoom, player } })
        );
        broadcast(currentRoom, {
          type: 'PLAYER_LIST_UPDATED',
          payload: { players: room.clients.map((c) => c.player) },
        });
        break;
      }
      case 'KICK_PLAYER': {
        if (!currentRoom) return;
        const targetId = data.payload.playerId;
        const room = rooms.get(currentRoom);
        const target = room.clients.find((c) => c.player.id === targetId);
        if (target) {
          target.ws.send(
            JSON.stringify({ type: 'PLAYER_KICKED', payload: { playerId: targetId } })
          );
          target.ws.close();
        }
        break;
      }
      default: {
        if (currentRoom) {
          broadcast(currentRoom, data);
        }
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.clients = room.clients.filter((c) => c.ws !== ws);
    broadcast(currentRoom, {
      type: 'PLAYER_LIST_UPDATED',
      payload: { players: room.clients.map((c) => c.player) },
    });
  });
});

console.log('WebSocket server running on ws://localhost:3001');
