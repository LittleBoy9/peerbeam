// PeerManager.ts - Handles WebRTC mesh network for broadcast chat

export interface Message {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface Peer {
  id: string;
  name: string;
  connection: RTCPeerConnection;
  channel?: RTCDataChannel;
  connected: boolean;
}

export type SignalType =
  | { type: 'announce'; peerId: string; peerName: string }
  | { type: 'offer'; from: string; fromName: string; to: string; offer: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; fromName: string; to: string; answer: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'leave'; peerId: string };

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ]
};

export class PeerManager {
  private peerId: string;
  private peerName: string;
  private peers: Map<string, Peer> = new Map();
  private signalChannel: BroadcastChannel;
  private roomId: string;

  private onMessageCallback?: (message: Message) => void;
  private onPeerJoinCallback?: (peerId: string, peerName: string) => void;
  private onPeerLeaveCallback?: (peerId: string) => void;
  private onConnectionChangeCallback?: (connected: boolean, peerCount: number) => void;

  constructor(roomId: string, peerName: string) {
    this.peerId = this.generateId();
    this.peerName = peerName;
    this.roomId = roomId;
    this.signalChannel = new BroadcastChannel(`peerbeam-${roomId}`);

    this.signalChannel.onmessage = (event) => this.handleSignal(event.data);

    // Announce presence to the room
    this.announce();

    // Handle page unload
    window.addEventListener('beforeunload', () => this.leave());
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private announce() {
    const signal: SignalType = {
      type: 'announce',
      peerId: this.peerId,
      peerName: this.peerName
    };
    this.signalChannel.postMessage(signal);
  }

  private async handleSignal(signal: SignalType) {
    switch (signal.type) {
      case 'announce':
        if (signal.peerId !== this.peerId && !this.peers.has(signal.peerId)) {
          // New peer joined, create offer to connect
          await this.createConnection(signal.peerId, signal.peerName, true);
          this.onPeerJoinCallback?.(signal.peerId, signal.peerName);
        }
        break;

      case 'offer':
        if (signal.to === this.peerId) {
          await this.handleOffer(signal.from, signal.fromName, signal.offer);
        }
        break;

      case 'answer':
        if (signal.to === this.peerId) {
          await this.handleAnswer(signal.from, signal.answer);
        }
        break;

      case 'ice-candidate':
        if (signal.to === this.peerId) {
          await this.handleIceCandidate(signal.from, signal.candidate);
        }
        break;

      case 'leave':
        if (signal.peerId !== this.peerId) {
          this.removePeer(signal.peerId);
        }
        break;
    }
  }

  private async createConnection(remotePeerId: string, remotePeerName: string, createOffer: boolean) {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    const peer: Peer = {
      id: remotePeerId,
      name: remotePeerName,
      connection: pc,
      connected: false
    };

    this.peers.set(remotePeerId, peer);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const signal: SignalType = {
          type: 'ice-candidate',
          from: this.peerId,
          to: remotePeerId,
          candidate: event.candidate.toJSON()
        };
        this.signalChannel.postMessage(signal);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Connection state with ${remotePeerId}: ${state}`);

      if (state === 'connected') {
        peer.connected = true;
        this.notifyConnectionChange();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        peer.connected = false;
        this.notifyConnectionChange();
        if (state === 'failed') {
          this.removePeer(remotePeerId);
        }
      }
    };

    pc.ondatachannel = (event) => {
      peer.channel = event.channel;
      this.setupDataChannel(peer);
    };

    if (createOffer) {
      // Create data channel and offer
      peer.channel = pc.createDataChannel('chat');
      this.setupDataChannel(peer);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const signal: SignalType = {
        type: 'offer',
        from: this.peerId,
        fromName: this.peerName,
        to: remotePeerId,
        offer: offer
      };
      this.signalChannel.postMessage(signal);
    }

    return peer;
  }

  private setupDataChannel(peer: Peer) {
    if (!peer.channel) return;

    peer.channel.onopen = () => {
      console.log(`Data channel open with ${peer.id}`);
      peer.connected = true;
      this.notifyConnectionChange();
    };

    peer.channel.onclose = () => {
      console.log(`Data channel closed with ${peer.id}`);
      peer.connected = false;
      this.notifyConnectionChange();
    };

    peer.channel.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        this.onMessageCallback?.(message);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };
  }

  private async handleOffer(fromId: string, fromName: string, offer: RTCSessionDescriptionInit) {
    let peer = this.peers.get(fromId);

    if (!peer) {
      peer = await this.createConnection(fromId, fromName, false);
      this.onPeerJoinCallback?.(fromId, fromName);
    }

    await peer.connection.setRemoteDescription(offer);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);

    const signal: SignalType = {
      type: 'answer',
      from: this.peerId,
      fromName: this.peerName,
      to: fromId,
      answer: answer
    };
    this.signalChannel.postMessage(signal);
  }

  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(fromId);
    if (peer) {
      await peer.connection.setRemoteDescription(answer);
    }
  }

  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(fromId);
    if (peer) {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.channel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
      this.onPeerLeaveCallback?.(peerId);
      this.notifyConnectionChange();
    }
  }

  private notifyConnectionChange() {
    const connectedCount = Array.from(this.peers.values()).filter(p => p.connected).length;
    this.onConnectionChangeCallback?.(connectedCount > 0, connectedCount);
  }

  // Public API

  sendMessage(text: string) {
    const message: Message = {
      id: this.generateId(),
      sender: this.peerId,
      senderName: this.peerName,
      text,
      timestamp: Date.now()
    };

    // Send to all connected peers
    this.peers.forEach((peer) => {
      if (peer.channel && peer.channel.readyState === 'open') {
        peer.channel.send(JSON.stringify(message));
      }
    });

    // Return message so it can be added to local UI
    return message;
  }

  leave() {
    const signal: SignalType = {
      type: 'leave',
      peerId: this.peerId
    };
    this.signalChannel.postMessage(signal);

    // Close all connections
    this.peers.forEach((peer) => {
      peer.channel?.close();
      peer.connection.close();
    });
    this.peers.clear();
    this.signalChannel.close();
  }

  onMessage(callback: (message: Message) => void) {
    this.onMessageCallback = callback;
  }

  onPeerJoin(callback: (peerId: string, peerName: string) => void) {
    this.onPeerJoinCallback = callback;
  }

  onPeerLeave(callback: (peerId: string) => void) {
    this.onPeerLeaveCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean, peerCount: number) => void) {
    this.onConnectionChangeCallback = callback;
  }

  getPeerId(): string {
    return this.peerId;
  }

  getPeerName(): string {
    return this.peerName;
  }

  getConnectedPeers(): Array<{ id: string; name: string }> {
    return Array.from(this.peers.values())
      .filter(p => p.connected)
      .map(p => ({ id: p.id, name: p.name }));
  }

  getPeerCount(): number {
    return Array.from(this.peers.values()).filter(p => p.connected).length;
  }
}
