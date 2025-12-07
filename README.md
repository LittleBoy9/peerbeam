# PeerBeam

A Chrome extension for serverless peer-to-peer chat using WebRTC.

![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-brightgreen)
![WebRTC](https://img.shields.io/badge/P2P-WebRTC-blue)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)
![React](https://img.shields.io/badge/UI-React%2018-61dafb)

## Features

- **Direct P2P Messaging** - Messages go directly between peers, not through servers
- **Room-Based Chat** - Create or join rooms with simple Room IDs
- **Multi-User Support** - Full mesh network connecting all peers in a room
- **Real-Time Presence** - See who's online and connection status
- **No Account Required** - Just enter a name and start chatting

## How It Works

```
┌──────────┐                              ┌──────────┐
│  Peer A  │◄─── WebRTC DataChannel ────►│  Peer B  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │         ┌─────────────────┐            │
     └────────►│ Signaling Server │◄───────────┘
               │   (WebSocket)    │
               └─────────────────┘
                   (handshake only)
```

1. **Signaling** - WebSocket server helps peers discover each other and exchange connection info
2. **Connection** - WebRTC establishes direct peer-to-peer connections
3. **Messaging** - All messages flow directly between peers (server not involved)

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Build**: Vite 5
- **P2P**: WebRTC (RTCPeerConnection + RTCDataChannel)
- **Signaling**: WebSocket + Node.js server
- **Extension**: Chrome Manifest V3

## Quick Start

### Prerequisites

- Node.js 18+
- Chrome browser

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/PeerBeam.git
cd PeerBeam

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

### Run Signaling Server (Optional)

The extension uses a hosted signaling server by default. To run locally:

```bash
cd server
npm install
npm start
```

Then update `DEFAULT_SERVER` in `src/popup/Popup.tsx`:

```typescript
const DEFAULT_SERVER = "ws://localhost:9876";
```

## Project Structure

```
PeerBeam/
├── src/
│   ├── lib/
│   │   └── MeshPeerManager.ts   # WebRTC + WebSocket logic
│   ├── popup/
│   │   └── Popup.tsx            # React UI
│   └── styles/
│       └── index.css            # Tailwind
├── server/
│   └── index.js                 # Signaling server
├── public/
│   └── manifest.json            # Extension manifest
└── dist/                        # Built extension
```

## Development

```bash
# Dev server with HMR
npm run dev

# Production build
npm run build
```

## How the P2P Works

### Mesh Topology

Every peer connects directly to every other peer:

```
     Alice
    /     \
   /       \
Bob ─────── Charlie
```

### Connection Flow

1. User joins room via signaling server
2. Server notifies existing peers
3. Existing peers create WebRTC offers
4. New peer responds with answers
5. ICE candidates exchanged for NAT traversal
6. Direct DataChannel connections established

### Message Flow

```typescript
// Messages sent directly to each peer
peers.forEach(peer => {
  peer.channel.send(JSON.stringify(message));
});
```

## Server API

### WebSocket Messages

| Type | Description |
|------|-------------|
| `join` | Join a room |
| `room-joined` | Confirmation + peer list |
| `peer-joined` | New peer notification |
| `peer-left` | Peer disconnect notification |
| `offer/answer` | WebRTC signaling |
| `ice-candidate` | ICE candidate exchange |

### REST Endpoints

- `GET /health` - Server status
- `GET /rooms` - List active rooms

## Configuration

### STUN Servers

```typescript
const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
```

### Extension Permissions

- `storage` - Save username locally

## Limitations

- Works best with < 20 peers per room (mesh topology)
- Requires WebRTC-compatible network (most networks work)
- Chrome/Chromium browsers only

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

---

Developed by [Sounak](https://www.linkedin.com/in/sounakdas/)
