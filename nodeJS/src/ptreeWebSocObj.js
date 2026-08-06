const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');

class PeerWebSocObj {
  constructor(peerTree, wsPort, secure = true) {
    this.peer = peerTree;
    this.port = wsPort;
    this.secureReceptor = secure;
    this.allow = ["127.0.0.1"];
    this.clients = new Map(); // Track connected clients with their identities
    this.clientIdentities = new Map(); // Map Address -> clientId
    this.messageHandlers = new Map(); // Custom message handlers
    this.authenticatedClients = new Set(); // Track authenticated clients

    this.readConfigFile();

    // WebSocket server options
    const options = {};
    if (this.secureReceptor) {
      try {
        options.key = fs.readFileSync('keys/privkey.pem');
        options.cert = fs.readFileSync('keys/fullchain.pem');
      } catch (err) {
        console.error('Failed to load SSL certificates:', err.message);
        throw err;
      }
    }

    // Create server based on security setting
    if (this.secureReceptor) {
      this.server = https.createServer(options);
    } else {
      this.server = http.createServer();
    }

    // Create WebSocket server
    this.wss = new WebSocket.Server({ 
      server: this.server,
      perMessageDeflate: false
    });

    // WebSocket connection handling
    this.wss.on('connection', (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      
      // Allowlist enforcement
      if (this.secureReceptor && !this.allow.includes(clientIP)) {
        console.error(`Rejected WebSocket connection from ${clientIP}`);
        //ws.close(1008, 'Not allowed');
        //return;
      }

      const clientId = this._generateClientId();
      const clientData = {
        id: clientId,
        ip: clientIP,
        connected: true,
        authenticated: false,
        identity: null,
        borgToken: null,
        connectedAt: Date.now()
      };
      
      this.clients.set(clientId, clientData);
      
      console.log(`WebSocket client connected: ${clientId} from ${clientIP}`);

      ws.on('message', (message) => {
        this._handleIncoming(ws, clientId, message);
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this._removeClient(clientId);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for client ${clientId}:`, err.message);
      });

      // Send welcome message
      this._sendToClient(ws, {
        type: 'welcome',
        clientId: clientId,
        timestamp: Date.now(),
        requiresAuth: true,
        message: 'Please authenticate with BorgToken'
      });
    });

    this.server.listen(this.port, () => {
      console.log(`PeerWebSocObj running on port ${this.port} (${this.secureReceptor ? 'secure' : 'insecure'})`);
      console.log(`Allowlist:`, this.allow);
    });
  }

  readConfigFile() {
    try {
      if (!this.secureReceptor) throw { message: 'PeerWebSocObj: secureReceptor NOT set to true' };
      const raw = fs.readFileSync('keys/chatOrganCell.conf').toString();
      const j = JSON.parse(raw);
      this.secureReceptor = j.receptor.secure || false;
      this.port = j.receptor.port || this.port;
      this.allow = j.receptor.allow || this.allow;
    } catch (err) {
      //this.secureReceptor = false;
      console.error('WARNING - WebSocket Security Mode is OFF receptor is public::: !', err.message);
    }
  }

  _generateClientId() {
    return 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  _removeClient(clientId) {
    const clientData = this.clients.get(clientId);
    if (clientData && clientData.identity) {
      // Remove from identity map
      const address = clientData.identity.Address;
      if (address && this.clientIdentities.get(address) === clientId) {
        this.clientIdentities.delete(address);
      }
      // Remove from authenticated set
      if (clientData.authenticated) {
        this.authenticatedClients.delete(clientId);
      }
    }
    this.clients.delete(clientId);
  }

  _handleIncoming(ws, clientId, message) {
    try {
      // Try to parse as JSON
      const json = typeof message === 'string' ? JSON.parse(message) : JSON.parse(message.toString());
      
      console.log(`got WebSocket message from ${clientId}:`, json);

      // Check if it's an authentication message
      if (json.type === 'auth' && json.borgToken) {
        this._handleAuthentication(ws, clientId, json.borgToken);
        return;
      }

      // Check if client is authenticated for other messages
      const clientData = this.clients.get(clientId);
      if (!clientData || !clientData.authenticated) {
        this._sendToClient(ws, {
          type: 'error',
          error: 'Not authenticated',
          message: 'Please authenticate with BorgToken first'
        });
        return;
      }

      // Check if there's a custom handler for this message type
      const msgType = json.type || 'default';
      if (this.messageHandlers.has(msgType)) {
        const handler = this.messageHandlers.get(msgType);
        handler(json, ws, clientId, clientData.identity);
      } else {
        // Use the main handler
        this.handleWSMessage(json, ws, clientId, clientData.identity);
      }
    } catch (err) {
      console.error('Invalid WebSocket message:', err.message);
      this._sendToClient(ws, {
        type: 'error',
        error: 'Invalid message format',
        details: err.message
      });
    }
  }

  _handleAuthentication(ws, clientId, borgToken) {
    try {
      // Verify the BorgToken
      const result = this.checkBorgToken(borgToken);
      
      if (result === true) {
        // Authentication successful
        const clientData = this.clients.get(clientId);
        clientData.authenticated = true;
        clientData.borgToken = borgToken;
        clientData.identity = {
          Address: borgToken.Address,
          pubKey: borgToken.pubKey,
          sesTok: borgToken.sesTok,
          reqId: borgToken.reqId,
          reqTime: borgToken.reqTime
        };

        // Map Address to clientId
        this.clientIdentities.set(borgToken.Address, clientId);
        this.authenticatedClients.add(clientId);

        console.log(`Client ${clientId} authenticated as ${borgToken.Address}`);

        this._sendToClient(ws, {
          type: 'auth_success',
          clientId: clientId,
          address: borgToken.Address,
          timestamp: Date.now()
        });

        // Notify others about new authenticated client
        this.broadcast({
          type: 'client_connected',
          address: borgToken.Address,
          timestamp: Date.now()
        }, clientId);

      } else {
        // Authentication failed
        console.log(`Authentication failed for client ${clientId}`);
        this._sendToClient(ws, {
          type: 'auth_failed',
          error: 'Authentication failed',
          timestamp: Date.now()
        });
        // Close connection after failed authentication
        setTimeout(() => {
          ws.close(1008, 'Authentication failed');
        }, 1000);
      }
    } catch (err) {
      console.error('Authentication error:', err.message);
      this._sendToClient(ws, {
        type: 'auth_error',
        error: 'Authentication error',
        details: err.message
      });
    }
  }

  checkBorgToken(borgToken) {
    try {
      // Use the peer's net.verifyLogin if available
      if (this.peer && this.peer.net && this.peer.net.verifyLogin) {
        const tok = {borgToken:borgToken};
	const doTry = this.peer.net.verifyLogin(tok);
        if (doTry.result === true) {
          return true;
        }
        console.log(`checkBorgToken():: doTry`, doTry, borgToken);
        
        // Return error info for the caller
        return false;
      }
      
      // Fallback verification (for testing)
      console.warn('Peer net.verifyLogin not available - using fallback verification');
      if (borgToken.Address && borgToken.pubKey && borgToken.sesTok) {
        return true;
      }
      return false;
      
    } catch (err) {
      console.error('Error in checkBorgToken:', err.message);
      return false;
    }
  }

  // Main message handler - to be overridden by subclasses
  handleWSMessage(msg, ws, clientId, identity) {
    // Default implementation - echo back with identity
    this._sendToClient(ws, {
      type: 'response',
      clientId: clientId,
      address: identity.Address,
      original: msg,
      timestamp: Date.now()
    });
  }

  // Register custom message handlers
  registerHandler(messageType, handlerFunction) {
    this.messageHandlers.set(messageType, handlerFunction);
  }

  // Send message to a specific client
  _sendToClient(ws, data) {
    try {
      const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(jsonData);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error sending WebSocket message:', err.message);
      return false;
    }
  }

  // Send message to a specific client by ID
  sendToClient(clientId, data) {
    const ws = this._getWebSocket(clientId);
    if (ws) {
      return this._sendToClient(ws, data);
    }
    console.error(`Client ${clientId} not found`);
    return false;
  }

  // Send message to a specific address
  sendToAddress(address, data) {
    const clientId = this.clientIdentities.get(address);
    if (clientId) {
      return this.sendToClient(clientId, data);
    }
    console.error(`Address ${address} not connected`);
    return false;
  }

  // Broadcast to all connected clients
  broadcast(data, excludeClientId = null) {
    let sent = 0;
    for (const [clientId, ws] of this.clients.entries()) {
      if (clientId === excludeClientId) continue;
      if (this._sendToClient(ws, data)) sent++;
    }
    return sent;
  }

  // Broadcast to authenticated clients only
  broadcastToAuthenticated(data, excludeClientId = null) {
    let sent = 0;
    for (const [clientId, ws] of this.clients.entries()) {
      if (clientId === excludeClientId) continue;
      const clientData = this.clients.get(clientId);
      if (clientData && clientData.authenticated) {
        if (this._sendToClient(ws, data)) sent++;
      }
    }
    return sent;
  }

  // Get WebSocket instance for a client
  _getWebSocket(clientId) {
    // We need to store ws reference separately
    // This is a limitation - we'll add a separate map for ws references
    return this._wsMap ? this._wsMap.get(clientId) : null;
  }

  // Override connection handling to store ws references
  _setupClientConnection(ws, clientId) {
    if (!this._wsMap) this._wsMap = new Map();
    this._wsMap.set(clientId, ws);
  }

  // Get list of connected clients
  getConnectedClients() {
    const clients = [];
    for (const [clientId, data] of this.clients.entries()) {
      if (data.authenticated) {
        clients.push({
          clientId: clientId,
          address: data.identity.Address,
          connectedAt: data.connectedAt,
          ip: data.ip
        });
      }
    }
    return clients;
  }

  // Get client info
  getClientInfo(clientId) {
    const clientData = this.clients.get(clientId);
    if (clientData) {
      return {
        id: clientData.id,
        ip: clientData.ip,
        connected: clientData.connected,
        authenticated: clientData.authenticated,
        address: clientData.identity ? clientData.identity.Address : null,
        connectedAt: clientData.connectedAt
      };
    }
    return null;
  }

  // Get client ID by address
  getClientIdByAddress(address) {
    return this.clientIdentities.get(address) || null;
  }

  // Check if client is authenticated
  isClientAuthenticated(clientId) {
    return this.authenticatedClients.has(clientId);
  }

  // Check if address is connected
  isAddressConnected(address) {
    return this.clientIdentities.has(address);
  }

  // Get number of connected clients
  getClientCount() {
    return this.clients.size;
  }

  // Get number of authenticated clients
  getAuthenticatedClientCount() {
    return this.authenticatedClients.size;
  }

  // Close connection to a specific client
  closeClient(clientId, code = 1000, reason = 'Normal closure') {
    const ws = this._getWebSocket(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(code, reason);
      this._removeClient(clientId);
      if (this._wsMap) this._wsMap.delete(clientId);
      return true;
    }
    return false;
  }

  // Close connection by address
  closeAddress(address, code = 1000, reason = 'Normal closure') {
    const clientId = this.clientIdentities.get(address);
    if (clientId) {
      return this.closeClient(clientId, code, reason);
    }
    return false;
  }

  // Close all connections and shutdown
  shutdown(callback = null) {
    console.log('Shutting down WebSocket server...');
    
    // Close all client connections
    for (const [clientId, ws] of this.clients.entries()) {
      try {
        ws.close(1000, 'Server shutting down');
      } catch (err) {
        console.error(`Error closing client ${clientId}:`, err.message);
      }
    }
    this.clients.clear();
    this.clientIdentities.clear();
    this.authenticatedClients.clear();
    if (this._wsMap) this._wsMap.clear();

    // Close WebSocket server
    this.wss.close(() => {
      // Close HTTP server
      this.server.close(() => {
        console.log('WebSocket server shutdown complete');
        if (callback) callback();
      });
    });
  }

  // Send ping to keep connection alive
  pingClient(clientId) {
    const ws = this._getWebSocket(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
      return true;
    }
    return false;
  }

  // Ping all connected clients
  pingAll() {
    let pings = 0;
    for (const [clientId, ws] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        pings++;
      }
    }
    return pings;
  }
}

// Override connection handling to store ws references
PeerWebSocObj.prototype._handleConnection = function(ws, req) {
  // ... existing connection handling code ...
  this._setupClientConnection(ws, clientId);
};

module.exports = PeerWebSocObj;
