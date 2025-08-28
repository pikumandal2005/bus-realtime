// server.js — public website + WebSockets on same port (Render-ready)
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Optional: ensure / serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const server = http.createServer(app);

// Two WebSocket endpoints on the same HTTP server
const wssDrivers = new WebSocket.Server({ noServer: true });
const wssMap = new WebSocket.Server({ noServer: true });

// Keep last known positions by bus_id
const lastPos = new Map();

function broadcastToMaps(msg) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  wssMap.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

// Route upgrades based on URL path
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/driver') {
    wssDrivers.handleUpgrade(req, socket, head, (ws) => {
      wssDrivers.emit('connection', ws, req);
    });
  } else if (req.url === '/map') {
    wssMap.handleUpgrade(req, socket, head, (ws) => {
      wssMap.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Send cached positions to new map clients
wssMap.on('connection', (ws) => {
  for (const [, pos] of lastPos) {
    ws.send(JSON.stringify(pos));
  }
});

// Accept driver messages and rebroadcast
wssDrivers.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (!data || !data.bus_id || data.lat === undefined || data.lng === undefined) return;
      data.ts = data.ts || Date.now();
      lastPos.set(String(data.bus_id), data);
      broadcastToMaps(data);
    } catch {
      // ignore invalid JSON
    }
  });
});

// IMPORTANT for Render: bind to 0.0.0.0 and PORT env var
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP+WS server listening on ${PORT}`);
});