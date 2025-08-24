const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  console.log('Yeni bağlantı geldi.');

  ws.on('message', function incoming(message) {
    console.log('Gelen mesaj:', message);
    ws.send(`Echo: ${message}`);
  });

  ws.on('close', () => {
    console.log('Bağlantı kapandı.');
  });
});

app.get('/', (req, res) => res.send('Socket server OK'));

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ WebSocket sunucu çalışıyor http://0.0.0.0:3001');
});

