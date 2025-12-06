#!/usr/bin/env node

/**
 * PeerBeam Local Signaling Server
 * Run this on any machine in your network to enable auto-discovery
 *
 * Usage: node server/index.js
 * Or:    npx peerbeam (if published)
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = process.env.PORT || 9876;

// Get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Room storage
const rooms = new Map(); // roomId -> Set of { ws, peerId, peerName }

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
    return;
  }

  if (req.url === '/rooms') {
    const roomList = [];
    rooms.forEach((peers, roomId) => {
      roomList.push({
        id: roomId,
        peerCount: peers.size,
        peers: Array.from(peers).map(p => ({ id: p.peerId, name: p.peerName }))
      });
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(roomList));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let peerInfo = null;

  console.log('New connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'join': {
          const { roomId, peerId, peerName } = message;

          // Leave current room if any
          if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(peerInfo);
            broadcastToRoom(currentRoom, {
              type: 'peer-left',
              peerId: peerInfo.peerId,
              peerName: peerInfo.peerName
            }, ws);
          }

          // Join new room
          currentRoom = roomId;
          peerInfo = { ws, peerId, peerName };

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }

          const room = rooms.get(roomId);

          // Send existing peers to the new joiner
          const existingPeers = Array.from(room).map(p => ({
            peerId: p.peerId,
            peerName: p.peerName
          }));

          ws.send(JSON.stringify({
            type: 'room-joined',
            roomId,
            peers: existingPeers
          }));

          // Notify existing peers about new joiner
          broadcastToRoom(roomId, {
            type: 'peer-joined',
            peerId,
            peerName
          }, ws);

          room.add(peerInfo);
          console.log(`${peerName} joined room ${roomId} (${room.size} peers)`);
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          // Relay to specific peer
          const { to } = message;
          const room = rooms.get(currentRoom);
          if (room) {
            for (const peer of room) {
              if (peer.peerId === to) {
                peer.ws.send(JSON.stringify(message));
                break;
              }
            }
          }
          break;
        }

        case 'broadcast': {
          // Broadcast message to all peers in room (for chat relay if needed)
          broadcastToRoom(currentRoom, message, ws);
          break;
        }

        case 'get-rooms': {
          const roomList = [];
          rooms.forEach((peers, roomId) => {
            roomList.push({
              id: roomId,
              peerCount: peers.size,
              peers: Array.from(peers).map(p => ({ id: p.peerId, name: p.peerName }))
            });
          });
          ws.send(JSON.stringify({ type: 'rooms-list', rooms: roomList }));
          break;
        }
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  });

  ws.on('close', () => {
    if (currentRoom && peerInfo && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(peerInfo);

      broadcastToRoom(currentRoom, {
        type: 'peer-left',
        peerId: peerInfo.peerId,
        peerName: peerInfo.peerName
      });

      console.log(`${peerInfo.peerName} left room ${currentRoom}`);

      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(currentRoom);
        console.log(`Room ${currentRoom} deleted (empty)`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const peer of room) {
    if (peer.ws !== excludeWs && peer.ws.readyState === 1) {
      peer.ws.send(data);
    }
  }
}

// Start server
httpServer.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();

  console.log('\n========================================');
  console.log('   PeerBeam Signaling Server Running');
  console.log('========================================\n');
  console.log('Share one of these addresses with others on your network:\n');

  ips.forEach(ip => {
    console.log(`   ws://${ip}:${PORT}`);
  });

  console.log(`\n   Also available at: ws://localhost:${PORT}`);
  console.log('\n========================================');
  console.log('Press Ctrl+C to stop the server\n');
});
