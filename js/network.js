// ============================================================================
// NETWORKING MODULE (WebRTC P2P with PeerJS)
// ============================================================================

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = []; // DataConnections (Host only)
    this.hostConnection = null; // DataConnection to Host (Client only)
    this.isHost = false;
    this.isSolo = true;
    this.myPeerId = null;
    this.roomCode = null;
    this.playerName = "Survivor";
    this.charClass = "commando";
    this.playerColor = "#22c55e";
    this.players = [];

    // Event callbacks
    this.onStateReceived = null;
    this.onPlayerAction = null;
    this.onChatReceived = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
  }

  static PLAYER_COLORS = [
    "#22c55e", // Green (Host)
    "#38bdf8", // Blue
    "#f59e0b", // Amber
    "#f43f5e", // Rose
    "#a855f7"  // Violet
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
  hostGame(playerName, charClass) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.isSolo = false;
      this.playerName = playerName || "Host Commander";
      this.charClass = charClass || "commando";
      this.playerColor = NetworkManager.PLAYER_COLORS[0];
      this.roomCode = this.generateRoomCode();
      const customPeerId = `urban-zombie-${this.roomCode.toLowerCase()}`;

      try {
        this.peer = new window.Peer(customPeerId, { debug: 1 });

        this.peer.on("open", (id) => {
          this.myPeerId = id;
          this.players = [{
            id: this.myPeerId,
            name: this.playerName,
            charClass: this.charClass,
            color: this.playerColor,
            isHost: true
          }];
          resolve(this.roomCode);
        });

        this.peer.on("connection", (conn) => {
          this.handleIncomingConnection(conn);
        });

        this.peer.on("error", (err) => {
          if (err.type === "unavailable-id") {
            this.hostGame(playerName, charClass).then(resolve).catch(reject);
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
          charClass: data.charClass || "commando",
          color: NetworkManager.PLAYER_COLORS[colorIdx],
          isHost: false
        };
        this.players.push(newPlayer);

        conn.send({
          type: "WELCOME",
          assignedColor: newPlayer.color,
          players: this.players
        });

        this.broadcast({
          type: "PLAYERS_UPDATE",
          players: this.players
        });

        if (this.onPlayerJoined) this.onPlayerJoined(newPlayer);
        break;
      }

      case "ACTION":
        if (this.onPlayerAction) {
          this.onPlayerAction(data.action, conn.peer);
        }
        break;

      case "CHAT":
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
    }
  }

  handleClientDisconnect(conn) {
    const idx = this.connections.indexOf(conn);
    if (idx !== -1) this.connections.splice(idx, 1);

    const pIdx = this.players.findIndex(p => p.id === conn.peer);
    if (pIdx !== -1) {
      const leaving = this.players[pIdx];
      this.players.splice(pIdx, 1);
      this.broadcast({
        type: "PLAYERS_UPDATE",
        players: this.players
      });
      if (this.onPlayerLeft) this.onPlayerLeft(leaving);
    }
  }

  // Join existing room
  joinGame(roomCode, playerName, charClass) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.isSolo = false;
      this.playerName = playerName || "Survivor";
      this.charClass = charClass || "commando";
      this.roomCode = roomCode.trim().toUpperCase();
      const targetPeerId = `urban-zombie-${this.roomCode.toLowerCase()}`;

      try {
        this.peer = new window.Peer({ debug: 1 });

        this.peer.on("open", (id) => {
          this.myPeerId = id;
          this.hostConnection = this.peer.connect(targetPeerId, { reliable: true });

          this.hostConnection.on("open", () => {
            this.hostConnection.send({
              type: "JOIN",
              playerName: this.playerName,
              charClass: this.charClass
            });
            resolve(this.roomCode);
          });

          this.hostConnection.on("data", (data) => {
            this.handleHostMessage(data);
          });

          this.hostConnection.on("error", (err) => reject(err));

          this.hostConnection.on("close", () => {
            alert("Host disconnected or match ended.");
            window.location.reload();
          });
        });

        this.peer.on("error", (err) => reject(err));
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
    }
  }

  broadcast(data, excludePeerId = null) {
    if (!this.isHost) return;
    for (const conn of this.connections) {
      if (conn.open && conn.peer !== excludePeerId) {
        conn.send(data);
      }
    }
  }

  sendAction(action) {
    if (this.isHost || this.isSolo) {
      if (this.onPlayerAction) {
        this.onPlayerAction(action, this.myPeerId);
      }
      return;
    }

    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
        type: "ACTION",
        action
      });
    }
  }

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
}
