// MeshPeerManager.ts - Multi-user P2P mesh network with signaling server

export interface Message {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface PeerInfo {
  id: string;
  name: string;
  connected: boolean;
}

export interface RoomInfo {
  id: string;
  peerCount: number;
  peers: Array<{ id: string; name: string }>;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]
};

interface PeerConnection {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  connected: boolean;
}

export class MeshPeerManager {
  private peerId: string;
  private peerName: string;
  private roomId: string = "";
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private peers: Map<string, PeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  private onMessageCallback?: (message: Message) => void;
  private onPeerJoinCallback?: (peerId: string, peerName: string) => void;
  private onPeerLeaveCallback?: (peerId: string, peerName: string) => void;
  private onConnectionChangeCallback?: (peers: PeerInfo[]) => void;
  private onRoomJoinedCallback?: (roomId: string, peers: Array<{ peerId: string; peerName: string }>) => void;
  private onServerConnectedCallback?: (connected: boolean) => void;
  private onRoomsListCallback?: (rooms: RoomInfo[]) => void;

  constructor(peerName: string, serverUrl: string) {
    this.peerId = this.generateId();
    this.peerName = peerName;
    this.serverUrl = serverUrl;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  // Connect to signaling server
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log("Connected to signaling server");
          this.onServerConnectedCallback?.(true);
          resolve(true);
        };

        this.ws.onclose = () => {
          console.log("Disconnected from signaling server");
          this.onServerConnectedCallback?.(false);
        };

        this.ws.onerror = () => {
          console.error("WebSocket error");
          this.onServerConnectedCallback?.(false);
          resolve(false);
        };

        this.ws.onmessage = (event) => {
          this.handleSignal(JSON.parse(event.data));
        };

        // Timeout after 5 seconds
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            resolve(false);
          }
        }, 5000);
      } catch {
        resolve(false);
      }
    });
  }

  private send(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private async handleSignal(signal: any) {
    switch (signal.type) {
      case "room-joined": {
        this.roomId = signal.roomId;
        this.onRoomJoinedCallback?.(signal.roomId, signal.peers);

        // Create connections to existing peers
        for (const peer of signal.peers) {
          await this.createPeerConnection(peer.peerId, peer.peerName, true);
        }
        break;
      }

      case "peer-joined": {
        // New peer joined, wait for their offer
        this.onPeerJoinCallback?.(signal.peerId, signal.peerName);
        break;
      }

      case "peer-left": {
        this.removePeer(signal.peerId);
        this.onPeerLeaveCallback?.(signal.peerId, signal.peerName);
        break;
      }

      case "offer": {
        await this.handleOffer(signal.from, signal.fromName, signal.offer);
        break;
      }

      case "answer": {
        await this.handleAnswer(signal.from, signal.answer);
        break;
      }

      case "ice-candidate": {
        await this.handleIceCandidate(signal.from, signal.candidate);
        break;
      }

      case "rooms-list": {
        this.onRoomsListCallback?.(signal.rooms);
        break;
      }
    }
  }

  private async createPeerConnection(remotePeerId: string, remotePeerName: string, createOffer: boolean): Promise<PeerConnection> {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    const peerConn: PeerConnection = {
      id: remotePeerId,
      name: remotePeerName,
      pc,
      channel: null,
      connected: false
    };

    this.peers.set(remotePeerId, peerConn);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: "ice-candidate",
          from: this.peerId,
          to: remotePeerId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Connection state with ${remotePeerName}: ${state}`);

      if (state === "connected") {
        peerConn.connected = true;
        this.notifyConnectionChange();
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        peerConn.connected = false;
        this.notifyConnectionChange();
      }
    };

    pc.ondatachannel = (event) => {
      peerConn.channel = event.channel;
      this.setupDataChannel(peerConn);
    };

    if (createOffer) {
      peerConn.channel = pc.createDataChannel("chat");
      this.setupDataChannel(peerConn);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.send({
        type: "offer",
        from: this.peerId,
        fromName: this.peerName,
        to: remotePeerId,
        offer: offer
      });
    }

    return peerConn;
  }

  private setupDataChannel(peer: PeerConnection) {
    if (!peer.channel) return;

    peer.channel.onopen = () => {
      console.log(`Data channel open with ${peer.name}`);
      peer.connected = true;
      this.notifyConnectionChange();
    };

    peer.channel.onclose = () => {
      console.log(`Data channel closed with ${peer.name}`);
      peer.connected = false;
      this.notifyConnectionChange();
    };

    peer.channel.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        this.onMessageCallback?.(message);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };
  }

  private async handleOffer(fromId: string, fromName: string, offer: RTCSessionDescriptionInit) {
    let peer = this.peers.get(fromId);

    if (!peer) {
      peer = await this.createPeerConnection(fromId, fromName, false);
    }

    await peer.pc.setRemoteDescription(offer);

    // Apply any pending ICE candidates
    const pending = this.pendingCandidates.get(fromId) || [];
    for (const candidate of pending) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.pendingCandidates.delete(fromId);

    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);

    this.send({
      type: "answer",
      from: this.peerId,
      fromName: this.peerName,
      to: fromId,
      answer: answer
    });
  }

  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(fromId);
    if (peer) {
      await peer.pc.setRemoteDescription(answer);

      // Apply any pending ICE candidates
      const pending = this.pendingCandidates.get(fromId) || [];
      for (const candidate of pending) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(fromId);
    }
  }

  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(fromId);
    if (peer && peer.pc.remoteDescription) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      // Queue candidate if remote description not set yet
      if (!this.pendingCandidates.has(fromId)) {
        this.pendingCandidates.set(fromId, []);
      }
      this.pendingCandidates.get(fromId)!.push(candidate);
    }
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.channel?.close();
      peer.pc.close();
      this.peers.delete(peerId);
      this.notifyConnectionChange();
    }
  }

  private notifyConnectionChange() {
    const peerList: PeerInfo[] = Array.from(this.peers.values()).map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected
    }));
    this.onConnectionChangeCallback?.(peerList);
  }

  // Public API

  joinRoom(roomId: string) {
    this.roomId = roomId;
    this.send({
      type: "join",
      roomId,
      peerId: this.peerId,
      peerName: this.peerName
    });
  }

  getRooms() {
    this.send({ type: "get-rooms" });
  }

  sendMessage(text: string): Message {
    const message: Message = {
      id: this.generateId(),
      sender: this.peerId,
      senderName: this.peerName,
      text,
      timestamp: Date.now()
    };

    // Send to all connected peers
    this.peers.forEach((peer) => {
      if (peer.channel && peer.channel.readyState === "open") {
        peer.channel.send(JSON.stringify(message));
      }
    });

    return message;
  }

  disconnect() {
    this.peers.forEach((peer) => {
      peer.channel?.close();
      peer.pc.close();
    });
    this.peers.clear();
    this.ws?.close();
    this.ws = null;
  }

  // Callbacks
  onMessage(callback: (message: Message) => void) {
    this.onMessageCallback = callback;
  }

  onPeerJoin(callback: (peerId: string, peerName: string) => void) {
    this.onPeerJoinCallback = callback;
  }

  onPeerLeave(callback: (peerId: string, peerName: string) => void) {
    this.onPeerLeaveCallback = callback;
  }

  onConnectionChange(callback: (peers: PeerInfo[]) => void) {
    this.onConnectionChangeCallback = callback;
  }

  onRoomJoined(callback: (roomId: string, peers: Array<{ peerId: string; peerName: string }>) => void) {
    this.onRoomJoinedCallback = callback;
  }

  onServerConnected(callback: (connected: boolean) => void) {
    this.onServerConnectedCallback = callback;
  }

  onRoomsList(callback: (rooms: RoomInfo[]) => void) {
    this.onRoomsListCallback = callback;
  }

  // Getters
  getPeerId(): string {
    return this.peerId;
  }

  getPeerName(): string {
    return this.peerName;
  }

  getRoomId(): string {
    return this.roomId;
  }

  getConnectedPeers(): PeerInfo[] {
    return Array.from(this.peers.values())
      .filter(p => p.connected)
      .map(p => ({ id: p.id, name: p.name, connected: true }));
  }

  isServerConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
