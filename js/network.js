// ============================================================================
// NETWORKING MODULE (WebRTC via PeerJS)
// ============================================================================

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = []; // Array of DataConnection objects (Host only)
    this.hostConnection = null; // DataConnection to Host (Client only)
    this.isHost = false;
    this.isSolo = true;
    this.myPeerId = null;
    this.roomCode = null;
    this.playerName = "Commander";
    this.playerColor = "#22c55e";
    this.players = []; // List of connected players { id, name, color }

    // Event callbacks
    this.onStateReceived = null;
    this.onCommandReceived = null;
    this.onChatReceived = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onCursorReceived = null;
  }

  // Predefined player colors for team coordination
  static PLAYER_COLORS = [
    "#22c55e", // Green (Host)
    "#38bdf8", // Blue
    "#f59e0b", // Amber
    "#a855f7", // Violet
    "#ec4899"  // Pink
  ];

  generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Host a new room
  hostGame(playerName) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.isSolo = false;
      this.playerName = playerName || "Host Commander";
      this.playerColor = NetworkManager.PLAYER_COLORS[0];
      this.roomCode = this.generateRoomCode();
      const customPeerId = `sanctum-td-${this.roomCode.toLowerCase()}`;

      try {
        this.peer = new window.Peer(customPeerId, {
          debug: 1
        });

        this.peer.on("open", (id) => {
          this.myPeerId = id;
          this.players = [{
            id: this.myPeerId,
            name: this.playerName,
            color: this.playerColor,
            isHost: true
          }];
          resolve(this.roomCode);
        });

        this.peer.on("connection", (conn) => {
          this.handleIncomingConnection(conn);
        });

        this.peer.on("error", (err) => {
          // If room code collided, retry with a fresh code
          if (err.type === "unavailable-id") {
            this.hostGame(playerName).then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  handleIncomingConnection(conn) {
    conn.on("open", () => {
      this.connections.push(conn);

      // Listen for data from this client
      conn.on("data", (data) => {
        this.handleClientMessage(conn, data);
      });

      conn.on("close", () => {
        this.handleClientDisconnect(conn);
      });
    });
  }

  handleClientMessage(conn, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case "JOIN": {
        const colorIdx = this.players.length % NetworkManager.PLAYER_COLORS.length;
        const newPlayer = {
          id: conn.peer,
          name: data.playerName || "Ally",
          color: NetworkManager.PLAYER_COLORS[colorIdx],
          isHost: false
        };
        this.players.push(newPlayer);

        // Send welcome packet with player info and current players
        conn.send({
          type: "WELCOME",
          assignedColor: newPlayer.color,
          players: this.players
        });

        // Broadcast updated players list
        this.broadcast({
          type: "PLAYERS_UPDATE",
          players: this.players
        });

        if (this.onPlayerJoined) this.onPlayerJoined(newPlayer);
        break;
      }

      case "COMMAND":
        if (this.onCommandReceived) {
          this.onCommandReceived(data.command, conn.peer);
        }
        break;

      case "CHAT":
        // Broadcast chat to all clients
        this.broadcast({
          type: "CHAT",
          sender: data.sender,
          text: data.text,
          color: data.color
        });
        if (this.onChatReceived) {
          this.onChatReceived(data.sender, data.text, data.color);
        }
        break;

      case "CURSOR":
        // Relay cursor position to other players
        this.broadcast({
          type: "CURSOR",
          playerId: conn.peer,
          x: data.x,
          y: data.y,
          name: data.name,
          color: data.color
        }, conn.peer); // exclude sender
        if (this.onCursorReceived) {
          this.onCursorReceived(conn.peer, data.x, data.y, data.name, data.color);
        }
        break;
    }
  }

  handleClientDisconnect(conn) {
    const idx = this.connections.indexOf(conn);
    if (idx !== -1) this.connections.splice(idx, 1);

    const playerIdx = this.players.findIndex(p => p.id === conn.peer);
    if (playerIdx !== -1) {
      const leaving = this.players[playerIdx];
      this.players.splice(playerIdx, 1);
      this.broadcast({
        type: "PLAYERS_UPDATE",
        players: this.players
      });
      if (this.onPlayerLeft) this.onPlayerLeft(leaving);
    }
  }

  // Join an existing room
  joinGame(roomCode, playerName) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.isSolo = false;
      this.playerName = playerName || "Guest Defender";
      this.roomCode = roomCode.trim().toUpperCase();
      const targetPeerId = `sanctum-td-${this.roomCode.toLowerCase()}`;

      try {
        this.peer = new window.Peer({
          debug: 1
        });

        this.peer.on("open", (id) => {
          this.myPeerId = id;
          this.hostConnection = this.peer.connect(targetPeerId, {
            reliable: true
          });

          this.hostConnection.on("open", () => {
            // Send join request
            this.hostConnection.send({
              type: "JOIN",
              playerName: this.playerName
            });
            resolve(this.roomCode);
          });

          this.hostConnection.on("data", (data) => {
            this.handleHostMessage(data);
          });

          this.hostConnection.on("error", (err) => {
            reject(err);
          });

          this.hostConnection.on("close", () => {
            alert("Host disconnected or match ended.");
            window.location.reload();
          });
        });

        this.peer.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  handleHostMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case "WELCOME":
        this.playerColor = data.assignedColor;
        this.players = data.players;
        if (this.onPlayerJoined) this.onPlayerJoined(this.players);
        break;

      case "PLAYERS_UPDATE":
        this.players = data.players;
        if (this.onPlayerJoined) this.onPlayerJoined(this.players);
        break;

      case "SYNC_STATE":
        if (this.onStateReceived) {
          this.onStateReceived(data.state);
        }
        break;

      case "CHAT":
        if (this.onChatReceived) {
          this.onChatReceived(data.sender, data.text, data.color);
        }
        break;

      case "CURSOR":
        if (this.onCursorReceived) {
          this.onCursorReceived(data.playerId, data.x, data.y, data.name, data.color);
        }
        break;
    }
  }

  // Broadcast payload to all connected clients (Host only)
  broadcast(data, excludePeerId = null) {
    if (!this.isHost) return;
    for (const conn of this.connections) {
      if (conn.open && conn.peer !== excludePeerId) {
        conn.send(data);
      }
    }
  }

  // Send command to Host (Client only)
  sendCommand(command) {
    if (this.isHost || this.isSolo) {
      if (this.onCommandReceived) {
        this.onCommandReceived(command, this.myPeerId);
      }
      return;
    }
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
        type: "COMMAND",
        command
      });
    }
  }

  // Send chat message
  sendChat(text) {
    if (this.isSolo) {
      if (this.onChatReceived) {
        this.onChatReceived(this.playerName, text, this.playerColor);
      }
      return;
    }

    if (this.isHost) {
      this.broadcast({
        type: "CHAT",
        sender: this.playerName,
        text,
        color: this.playerColor
      });
      if (this.onChatReceived) {
        this.onChatReceived(this.playerName, text, this.playerColor);
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
        type: "CHAT",
        sender: this.playerName,
        text,
        color: this.playerColor
      });
    }
  }

  // Broadcast cursor position
  sendCursor(x, y) {
    if (this.isSolo) return;

    if (this.isHost) {
      this.broadcast({
        type: "CURSOR",
        playerId: this.myPeerId,
        x,
        y,
        name: this.playerName,
        color: this.playerColor
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
        type: "CURSOR",
        x,
        y,
        name: this.playerName,
        color: this.playerColor
      });
    }
  }
}
