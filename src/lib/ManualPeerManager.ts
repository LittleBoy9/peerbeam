// ManualPeerManager.ts - Serverless P2P with manual offer/answer exchange

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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ]
};

export class ManualPeerManager {
  private peerId: string;
  private peerName: string;
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private isCreator: boolean;
  private connected: boolean = false;
  private remotePeerName: string = "";

  private onMessageCallback?: (message: Message) => void;
  private onConnectionChangeCallback?: (connected: boolean, peerName: string) => void;
  private onOfferReadyCallback?: (offer: string) => void;
  private onAnswerReadyCallback?: (answer: string) => void;

  constructor(peerName: string, isCreator: boolean) {
    this.peerId = this.generateId();
    this.peerName = peerName;
    this.isCreator = isCreator;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.setupPeerConnection();

    if (isCreator) {
      this.createDataChannel();
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private setupPeerConnection() {
    this.pc.onicecandidate = (event) => {
      if (!event.candidate) {
        // ICE gathering complete - now we have the full SDP
        const description = this.pc.localDescription;
        if (description) {
          const encoded = this.encodeDescription(description);
          if (this.isCreator) {
            this.onOfferReadyCallback?.(encoded);
          } else {
            this.onAnswerReadyCallback?.(encoded);
          }
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log("Connection state:", state);

      if (state === "connected") {
        this.connected = true;
        this.onConnectionChangeCallback?.(true, this.remotePeerName);
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        this.connected = false;
        this.onConnectionChangeCallback?.(false, this.remotePeerName);
      }
    };

    this.pc.ondatachannel = (event) => {
      console.log("Data channel received");
      this.channel = event.channel;
      this.setupDataChannel();
    };
  }

  private createDataChannel() {
    this.channel = this.pc.createDataChannel("chat");
    this.setupDataChannel();
  }

  private setupDataChannel() {
    if (!this.channel) return;

    this.channel.onopen = () => {
      console.log("Data channel open!");
      this.connected = true;
      // Send our name to the peer
      this.channel?.send(JSON.stringify({
        type: "handshake",
        name: this.peerName,
        id: this.peerId
      }));
      this.onConnectionChangeCallback?.(true, this.remotePeerName || "Peer");
    };

    this.channel.onclose = () => {
      console.log("Data channel closed");
      this.connected = false;
      this.onConnectionChangeCallback?.(false, this.remotePeerName);
    };

    this.channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "handshake") {
          this.remotePeerName = data.name;
          this.onConnectionChangeCallback?.(true, this.remotePeerName);
          return;
        }

        // Regular message
        const message: Message = data;
        this.onMessageCallback?.(message);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };
  }

  private encodeDescription(desc: RTCSessionDescription): string {
    const data = {
      type: desc.type,
      sdp: desc.sdp,
      name: this.peerName,
      id: this.peerId
    };
    return btoa(JSON.stringify(data));
  }

  private decodeDescription(encoded: string): { desc: RTCSessionDescriptionInit; name: string; id: string } {
    const data = JSON.parse(atob(encoded));
    return {
      desc: { type: data.type, sdp: data.sdp },
      name: data.name,
      id: data.id
    };
  }

  // Creator: Generate offer
  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    // ICE candidates will be gathered, then onOfferReadyCallback will be called
  }

  // Joiner: Apply offer and generate answer
  async applyOffer(encodedOffer: string): Promise<void> {
    const { desc, name, id } = this.decodeDescription(encodedOffer);
    this.remotePeerName = name;

    await this.pc.setRemoteDescription(desc);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    // ICE candidates will be gathered, then onAnswerReadyCallback will be called
  }

  // Creator: Apply answer to complete connection
  async applyAnswer(encodedAnswer: string): Promise<void> {
    const { desc, name } = this.decodeDescription(encodedAnswer);
    this.remotePeerName = name;
    await this.pc.setRemoteDescription(desc);
  }

  // Send a chat message
  sendMessage(text: string): Message {
    const message: Message = {
      id: this.generateId(),
      sender: this.peerId,
      senderName: this.peerName,
      text,
      timestamp: Date.now()
    };

    if (this.channel && this.channel.readyState === "open") {
      this.channel.send(JSON.stringify(message));
    }

    return message;
  }

  // Disconnect
  disconnect() {
    this.channel?.close();
    this.pc.close();
    this.connected = false;
  }

  // Callbacks
  onMessage(callback: (message: Message) => void) {
    this.onMessageCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean, peerName: string) => void) {
    this.onConnectionChangeCallback = callback;
  }

  onOfferReady(callback: (offer: string) => void) {
    this.onOfferReadyCallback = callback;
  }

  onAnswerReady(callback: (answer: string) => void) {
    this.onAnswerReadyCallback = callback;
  }

  // Getters
  isConnected(): boolean {
    return this.connected;
  }

  getPeerName(): string {
    return this.peerName;
  }

  getRemotePeerName(): string {
    return this.remotePeerName;
  }
}
