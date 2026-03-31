// src/server.js
const express = require('express');
const https = require('https');
const WebSocket = require('ws');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');

const app = express();

// Load SSL certificates conditionally
let server;
try {
  const options = {
    key:  fs.readFileSync(path.join(__dirname, '../certs/server.key')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/server.cert'))
  };
  server = https.createServer(options, app);
  console.log('✅ Started with HTTPS (Local SSL Certs found)');
} catch (err) {
  const http = require('http');
  server = http.createServer(app);
  console.log('⚠️ Started with HTTP (No SSL certs found - ideal for Cloud/Render)');
}

const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/exports', express.static(path.join(__dirname, '../exports')));

// WebSocket broadcast helper
app.broadcast = (data) => {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
};

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', message: 'Live updates active' }));
});

// Routes
app.use('/api/participants', require('./routes/participants'));
app.use('/api/import',       require('./routes/import'));
app.use('/api/scan',         require('./routes/scan'));
app.use('/api/badges',       require('./routes/badges'));
app.use('/api/settings',     require('./routes/settings'));
app.use('/api/export',       require('./routes/exportData'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
const HTTP_PORT = 8080; // Secondary port for redirections

// Helper to get local IP
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '192.168.x.x';
}

const LOCAL_IP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔒  Techmen QR App (HTTPS) running at:`);
  console.log(`   Local:   https://localhost:${PORT}`);
  console.log(`   Network: https://${LOCAL_IP}:${PORT}  ← USE THIS ON MOBILE\n`);
  console.log(`   ⚠️  SECURITY NOTE: Your browser will show a "connection is not private" warning.`);
  console.log(`      Click "Advanced" and then "Proceed to ${LOCAL_IP} (unsafe)" to continue.\n`);
});

// Also start a simple HTTP redirect server on 8080, only if using HTTPS locally
if (server.constructor.name === 'Server' && server.options && server.options.key) { // rudimentary check
  try {
    require('http').createServer((req, res) => {
      res.writeHead(301, { "Location": "https://" + req.headers['host'].replace(String(HTTP_PORT), String(PORT)) + req.url });
      res.end();
    }).listen(HTTP_PORT, '0.0.0.0');
    console.log(`📡 Secondary HTTP redirect server running on port ${HTTP_PORT}`);
  } catch (e) {
    // Port 8080 might be taken, which is generally ignorable for a local dev fallback.
  }
}
