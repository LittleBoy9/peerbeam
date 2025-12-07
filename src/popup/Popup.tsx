import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "../styles/index.css";
import { MeshPeerManager, Message, PeerInfo, RoomInfo } from "../lib/MeshPeerManager";

type Screen = "connect" | "lobby" | "chat";

interface ChatMessage extends Message {
  isOwn: boolean;
  isSystem?: boolean;
}

// const DEFAULT_SERVER = "ws://localhost:9876";
const DEFAULT_SERVER = "wss://peerbeam-vd0o.onrender.com";

function Popup() {
  const [screen, setScreen] = useState<Screen>("connect");
  const [userName, setUserName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // Lobby state
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [newRoomId, setNewRoomId] = useState("");

  // Chat state
  const [roomId, setRoomId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  const peerManagerRef = useRef<MeshPeerManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const roomRefreshInterval = useRef<number | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["userName"], (result) => {
      if (result.userName) setUserName(result.userName);
    });

    return () => {
      if (roomRefreshInterval.current) {
        clearInterval(roomRefreshInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addSystemMessage = (text: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      sender: "system",
      senderName: "System",
      text,
      timestamp: Date.now(),
      isOwn: false,
      isSystem: true,
    };
    setMessages((prev) => [...prev, msg]);
  };

  const connectToServer = async () => {
    if (!userName.trim()) {
      alert("Please enter your name");
      return;
    }

    setIsConnecting(true);
    chrome.storage.local.set({ userName: userName.trim() });

    const manager = new MeshPeerManager(userName.trim(), DEFAULT_SERVER);
    peerManagerRef.current = manager;

    manager.onServerConnected((connected) => {
      if (!connected && screen !== "connect") {
        addSystemMessage("Disconnected from server");
      }
    });

    manager.onRoomsList((roomList) => {
      setRooms(roomList);
    });

    manager.onRoomJoined((room, existingPeers) => {
      setRoomId(room);
      setScreen("chat");
      addSystemMessage(`Joined room ${room}`);
      if (existingPeers.length > 0) {
        addSystemMessage(`${existingPeers.length} peer(s) already in room`);
      }
    });

    manager.onPeerJoin((_, peerName) => {
      addSystemMessage(`${peerName} joined`);
    });

    manager.onPeerLeave((_, peerName) => {
      addSystemMessage(`${peerName} left`);
    });

    manager.onConnectionChange((peerList) => {
      setPeers(peerList);
    });

    manager.onMessage((message) => {
      setMessages((prev) => [...prev, { ...message, isOwn: false }]);
    });

    const connected = await manager.connect();
    setIsConnecting(false);

    if (connected) {
      setScreen("lobby");
      manager.getRooms();

      // Refresh rooms periodically
      roomRefreshInterval.current = window.setInterval(() => {
        manager.getRooms();
      }, 3000);
    } else {
      alert("Could not connect to server. Make sure it's running.");
      peerManagerRef.current = null;
    }
  };

  const joinRoom = (room: string) => {
    if (!room.trim()) return;
    peerManagerRef.current?.joinRoom(room.trim().toUpperCase());
  };

  const createRoom = () => {
    const room = newRoomId.trim() || generateRoomId();
    joinRoom(room);
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const sendMessage = () => {
    if (!inputText.trim() || !peerManagerRef.current) return;

    const message = peerManagerRef.current.sendMessage(inputText.trim());
    setMessages((prev) => [...prev, { ...message, isOwn: true }]);
    setInputText("");
  };

  const leaveRoom = () => {
    peerManagerRef.current?.disconnect();
    peerManagerRef.current = null;
    if (roomRefreshInterval.current) {
      clearInterval(roomRefreshInterval.current);
    }
    setScreen("connect");
    setMessages([]);
    setPeers([]);
    setRoomId("");
    setRooms([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
  };

  const connectedPeerCount = peers.filter(p => p.connected).length;

  // Connect Screen
  if (screen === "connect") {
    return (
      <div className="w-80 p-4 bg-gradient-to-br from-slate-900 to-slate-800 min-h-[400px]">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">PeerBeam</h1>
          <p className="text-slate-400 text-sm">Multi-User P2P Chat</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm mb-1">Your Name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="w-full p-2 rounded bg-slate-700 text-white placeholder-slate-400 border border-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            onClick={connectToServer}
            disabled={!userName.trim() || isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white p-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Connecting...
              </>
            ) : (
              "Connect to Server"
            )}
          </button>
        </div>

        <p className="text-slate-500 text-xs text-center mt-6">
          Join a room and share the Room ID with others to chat
        </p>

        <p className="text-slate-500 text-xs text-center mt-4">
          Developed by{" "}
          <a
            href="https://www.linkedin.com/in/sounakdas/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
          >
            Sounak
          </a>
        </p>
      </div>
    );
  }

  // Lobby Screen
  if (screen === "lobby") {
    return (
      <div className="w-80 p-4 bg-gradient-to-br from-slate-900 to-slate-800 min-h-[450px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Lobby</h2>
            <p className="text-slate-400 text-xs flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Connected as {userName}
            </p>
          </div>
          <button onClick={leaveRoom} className="text-slate-400 hover:text-white text-sm">
            Disconnect
          </button>
        </div>

        {/* Create Room */}
        <div className="mb-4">
          <label className="block text-slate-300 text-sm mb-1">Create or Join Room</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value.toUpperCase())}
              placeholder="Room ID (or leave empty)"
              className="flex-1 p-2 rounded bg-slate-700 text-white placeholder-slate-400 border border-slate-600 focus:border-blue-500 focus:outline-none text-sm uppercase"
            />
            <button
              onClick={createRoom}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded font-medium transition-colors"
            >
              Go
            </button>
          </div>
        </div>

        {/* Active Rooms */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-300 text-sm font-medium">Active Rooms</h3>
            <button
              onClick={() => peerManagerRef.current?.getRooms()}
              className="text-slate-400 hover:text-white text-xs"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {rooms.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">No active rooms</p>
                <p className="text-xs">Create one to get started!</p>
              </div>
            ) : (
              rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => joinRoom(room.id)}
                  className="w-full p-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{room.id}</span>
                    <span className="text-slate-400 text-sm">
                      {room.peerCount} peer{room.peerCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {room.peers.length > 0 && (
                    <p className="text-slate-400 text-xs mt-1 truncate">
                      {room.peers.map(p => p.name).join(", ")}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Chat Screen
  return (
    <div className="w-80 bg-slate-900 flex flex-col h-[500px]">
      {/* Header */}
      <div className="bg-slate-800 p-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold">Room: {roomId}</h2>
              <button
                onClick={copyRoomId}
                className="text-slate-400 hover:text-white transition-colors"
                title="Copy room ID"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="text-slate-400 text-xs">
              {connectedPeerCount > 0 ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  {connectedPeerCount} peer{connectedPeerCount !== 1 ? "s" : ""} connected
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  Waiting for peers...
                </span>
              )}
            </p>
          </div>
          <button
            onClick={leaveRoom}
            className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
          >
            Leave
          </button>
        </div>

        {/* Connected Peers */}
        {peers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {peers.map((peer) => (
              <span
                key={peer.id}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  peer.connected
                    ? "bg-green-900 text-green-300"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                {peer.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10">
            <p>No messages yet</p>
            <p className="text-sm">Share the room ID to invite others!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${
              msg.isSystem
                ? "text-center"
                : msg.isOwn
                ? "flex justify-end"
                : "flex justify-start"
            }`}
          >
            {msg.isSystem ? (
              <span className="text-slate-500 text-xs italic">{msg.text}</span>
            ) : (
              <div
                className={`max-w-[80%] rounded-lg p-2 ${
                  msg.isOwn ? "bg-blue-600 text-white" : "bg-slate-700 text-white"
                }`}
              >
                {!msg.isOwn && (
                  <p className="text-xs text-slate-400 mb-1">{msg.senderName}</p>
                )}
                <p className="text-sm break-words">{msg.text}</p>
                <p className="text-xs opacity-60 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-700 bg-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 p-2 rounded bg-slate-700 text-white placeholder-slate-400 border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 rounded font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
