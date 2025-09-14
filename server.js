const WebSocket = require('ws');
const crypto = require('crypto-js');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

let wss;
let clients = new Map();
let discoveryServer;
let discoveryClient;
let messageHistory = [];
let userSessions = new Map();

// Load message history from file
function loadMessageHistory() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'message_history.json'), 'utf8');
    messageHistory = JSON.parse(data);
  } catch (error) {
    messageHistory = [];
  }
}

// Save message history to file
function saveMessageHistory() {
  try {
    fs.writeFileSync(path.join(__dirname, 'message_history.json'), JSON.stringify(messageHistory, null, 2));
  } catch (error) {
    console.error('Error saving message history:', error);
  }
}

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Initialize network discovery
function initNetworkDiscovery() {
  // Start UDP discovery server
  discoveryServer = dgram.createSocket('udp4');

  discoveryServer.on('listening', () => {
    discoveryServer.setBroadcast(true);
    console.log('Discovery server listening on port 8081');
  });

  discoveryServer.on('message', (msg, rinfo) => {
    const message = msg.toString();
    if (message === 'QM_DISCOVERY_REQUEST') {
      const response = Buffer.from(`QM_DISCOVERY_RESPONSE:${os.hostname()}:${getLocalIP()}`);
      discoveryServer.send(response, 0, response.length, rinfo.port, rinfo.address);
    }
  });

  discoveryServer.bind(8081, () => {
    console.log('Discovery server bound to port 8081');
  });

  discoveryServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('Port 8081 is already in use. Discovery server disabled.');
    } else {
      console.error('Discovery server error:', err);
    }
  });

  // Start UDP discovery client for server discovery
  discoveryClient = dgram.createSocket('udp4');
  discoveryClient.bind(() => {
    discoveryClient.setBroadcast(true);
  });

  discoveryClient.on('error', (err) => {
    console.error('Discovery client error:', err);
  });
}

// Initialize WebSocket server
function initWebSocketServer() {
  try {
    wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });

    wss.on('connection', (ws, req) => {
      const clientId = req.socket.remoteAddress + ':' + req.socket.remotePort;
      clients.set(clientId, ws);

      ws.on('message', (message) => {
        handleMessage(ws, message, clientId);
      });

      ws.on('close', () => {
        clients.delete(clientId);
        // Remove user session
        for (const [userId, session] of userSessions) {
          if (session.clientId === clientId) {
            userSessions.delete(userId);
            break;
          }
        }
        broadcastUserList();
      });

      broadcastUserList();
    });

    wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    console.log('WebSocket server started on port 8080');
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.log('Port 8080 is already in use. WebSocket server disabled.');
      wss = null;
    } else {
      console.error('WebSocket server error:', error);
      wss = null;
    }
  }
}

// Handle incoming messages
function handleMessage(ws, message, clientId) {
  try {
    const data = JSON.parse(message);

    if (data.type === 'encrypted') {
      const decrypted = crypto.AES.decrypt(data.content, 'secret-key').toString(crypto.enc.Utf8);
      const parsedData = JSON.parse(decrypted);

      switch (parsedData.type) {
        case 'register':
          handleUserRegistration(ws, parsedData, clientId);
          break;
        case 'message':
          handleChatMessage(parsedData);
          break;
        case 'file':
          handleFileTransfer(parsedData);
          break;
        case 'ping':
          handlePing(ws);
          break;
        case 'change_username':
          handleUsernameChange(ws, parsedData);
          break;
        default:
          console.log('Unknown message type:', parsedData.type);
      }
    } else {
      // Handle unencrypted messages (like initial registration)
      switch (data.type) {
        case 'register':
          handleUserRegistration(ws, data, clientId);
          break;
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Handle user registration
function handleUserRegistration(ws, data, clientId) {
  console.log(`Registration attempt from ${clientId}: username '${data.username}', userId: ${data.userId || 'new'}, token: ${data.token ? 'provided' : 'none'}`);
  if (data.token) {
    console.log(`Client token: ${data.token}`);
  }

  // Validate token if provided
  if (data.token) {
    try {
      const decoded = jwt.verify(data.token, JWT_SECRET);
      let decryptedUserId;

      if (decoded.encryptedUserId) {
        // Decrypt encrypted userId
        decryptedUserId = crypto.AES.decrypt(decoded.encryptedUserId, data.password).toString(crypto.enc.Utf8);
        console.log(`Token decoded: encrypted userId decrypted to ${decryptedUserId}, issued at ${new Date(decoded.iat * 1000)}, expires at ${new Date(decoded.exp * 1000)}`);
      } else {
        throw new Error('Invalid token format: legacy tokens not supported');
      }

      if (decryptedUserId !== data.userId) {
        const errorResponse = {
          type: 'registration_error',
          error: 'Invalid token for userId.'
        };
        ws.send(JSON.stringify(errorResponse));
        console.log(`Registration rejected: Token mismatch for userId ${data.userId}`);
        return;
      }
    } catch (error) {
      const errorResponse = {
        type: 'registration_error',
        error: 'Invalid or expired token.'
      };
      ws.send(JSON.stringify(errorResponse));
      console.log(`Registration rejected: Invalid token for userId ${data.userId}`);
      console.log(`Token verification error: ${error.message}`);
      console.log(`Received token: ${data.token ? 'present' : 'null'}`);
      console.log(`Received password: ${data.password ? 'present' : 'null'}`);
      return;
    }
  }

  let userId;
  let isReconnect = false;

  if (data.userId && userSessions.has(data.userId)) {
    // Existing user reconnecting
    const existingSession = userSessions.get(data.userId);
    if (existingSession.username !== data.username) {
      // Username changed, update it
      existingSession.username = data.username;
    }
    userId = data.userId;
    isReconnect = true;
    console.log(`User reconnecting: ${data.username} (${userId})`);
  } else {
    // Check for duplicate username only for new users
    for (const [existingUserId, session] of userSessions) {
      if (session.username === data.username && existingUserId !== data.userId) {
        // Username already exists, reject registration
        const errorResponse = {
          type: 'registration_error',
          error: 'Username already in use. Please choose a different username.'
        };
        ws.send(JSON.stringify(errorResponse));
        console.log(`Registration rejected: Username '${data.username}' already exists (existing user: ${existingUserId})`);
        return;
      }
    }

    // New user
    userId = data.userId || crypto.lib.WordArray.random(16).toString();
  }

  ws.userId = userId;
  ws.username = data.username;

  // Store or update user session
  userSessions.set(userId, {
    clientId: clientId,
    username: data.username,
    connectedAt: new Date().toISOString()
  });

  // Encrypt userId with password
  const encryptedUserId = crypto.AES.encrypt(userId, data.password).toString();

  // Generate JWT token with encrypted userId
  const token = jwt.sign({ encryptedUserId }, JWT_SECRET, { expiresIn: '24h' });

  const response = {
    type: 'registration_success',
    userId: userId,
    token: token
  };

  ws.send(JSON.stringify(response));
  broadcastUserList();
  console.log(`${isReconnect ? 'User reconnected' : 'User registered'}: ${data.username} (${userId})`);
}

// Handle chat messages
function handleChatMessage(data) {
  console.log(`Chat message from userId ${data.from} to ${data.to}: ${data.content}`);
  const messageData = {
    type: 'message',
    from: data.from,
    to: data.to,
    content: data.content,
    timestamp: new Date().toISOString()
  };

  // Store message history
  messageHistory.push(messageData);
  saveMessageHistory();

  // Send to recipient
  if (data.to === 'all') {
    broadcastMessage(messageData);
  } else {
    sendToUser(data.to, messageData);
  }
}

// Handle username change
function handleUsernameChange(ws, data) {
  console.log(`Username change request from userId ${ws.userId}: '${ws.username}' -> '${data.newUsername}'`);
  if (ws.username && data.newUsername) {
    // Check for duplicate username (excluding current user)
    for (const [existingUserId, session] of userSessions) {
      if (session.username === data.newUsername && existingUserId !== ws.userId) {
        // Username already exists, reject change
        const errorResponse = {
          type: 'username_change_error',
          error: 'Username already in use. Please choose a different username.'
        };
        const encrypted = crypto.AES.encrypt(JSON.stringify(errorResponse), 'secret-key').toString();
        const packet = {
          type: 'encrypted',
          content: encrypted
        };
        ws.send(JSON.stringify(packet));
        console.log(`Username change rejected: '${data.newUsername}' already exists`);
        return;
      }
    }

    const oldUsername = ws.username;
    ws.username = data.newUsername;

    // Update user session
    if (userSessions.has(ws.userId)) {
      userSessions.get(ws.userId).username = data.newUsername;
    }

    // Notify all clients about the username change
    const changeNotification = {
      type: 'username_changed',
      userId: ws.userId,
      oldUsername: oldUsername,
      newUsername: data.newUsername
    };
    broadcastMessage(changeNotification);

    broadcastUserList();
    console.log(`Username changed: ${oldUsername} -> ${data.newUsername}`);
  }
}

// Handle ping messages
function handlePing(ws) {
  const pongMessage = {
    type: 'pong',
    timestamp: new Date().toISOString()
  };

  const encrypted = crypto.AES.encrypt(JSON.stringify(pongMessage), 'secret-key').toString();
  const packet = {
    type: 'encrypted',
    content: encrypted
  };

  ws.send(JSON.stringify(packet));
}

// Handle file transfers
function handleFileTransfer(data) {
  console.log(`File transfer from userId ${data.from} to ${data.to}: ${data.filename} (${(Buffer.from(data.fileData, 'base64').length / 1024 / 1024).toFixed(2)} MB)`);
  // Validate file size (max 5GB)
  const fileSize = Buffer.from(data.fileData, 'base64').length;
  if (fileSize > 5 * 1024 * 1024 * 1024) {
    console.error('File too large:', data.filename);
    return;
  }

  const fileData = {
    type: 'file',
    from: data.from,
    to: data.to,
    filename: data.filename,
    fileData: data.fileData,
    fileSize: fileSize,
    timestamp: new Date().toISOString()
  };

  // Store file message in history
  messageHistory.push(fileData);
  saveMessageHistory();

  if (data.to === 'all') {
    broadcastMessage(fileData);
  } else {
    sendToUser(data.to, fileData);
  }
}

// Broadcast message to all clients
function broadcastMessage(message) {
  if (!wss) return;

  const encrypted = crypto.AES.encrypt(JSON.stringify(message), 'secret-key').toString();
  const packet = {
    type: 'encrypted',
    content: encrypted
  };

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(packet));
    }
  });
}

// Send message to specific user
function sendToUser(userId, message) {
  if (!wss) return;

  const encrypted = crypto.AES.encrypt(JSON.stringify(message), 'secret-key').toString();
  const packet = {
    type: 'encrypted',
    content: encrypted
  };

  wss.clients.forEach(client => {
    if (client.userId === userId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(packet));
    }
  });
}

// Broadcast user list
function broadcastUserList() {
  if (!wss) return;

  const users = [];
  wss.clients.forEach(client => {
    if (client.username && client.userId) {
      users.push({
        id: client.userId,
        name: client.username
      });
    }
  });

  console.log('Broadcasting user list:', users); // Debug log

  const userListMessage = {
    type: 'user_list',
    users: users
  };

  broadcastMessage(userListMessage);
}

// Clear all user sessions (for debugging)
function clearAllSessions() {
  console.log('Clearing all user sessions...');
  userSessions.clear();
  console.log('All user sessions cleared');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  if (wss) {
    wss.close();
  }
  if (discoveryServer) {
    discoveryServer.close();
  }
  if (discoveryClient) {
    discoveryClient.close();
  }
  saveMessageHistory();
  process.exit(0);
});

// Handle custom commands for debugging
process.stdin.on('data', (data) => {
  const command = data.toString().trim();
  if (command === 'clear') {
    clearAllSessions();
  } else if (command === 'status') {
    console.log(`Current user sessions: ${userSessions.size}`);
    if (userSessions.size > 0) {
      console.log('Active users:');
      for (const [userId, session] of userSessions) {
        console.log(`  - ${session.username} (${userId})`);
      }
    } else {
      console.log('No active users');
    }
  } else if (command === 'help') {
    console.log('Available commands:');
    console.log('  clear - Clear all user sessions');
    console.log('  status - Show current user sessions');
    console.log('  help - Show this help');
  }
});

// Force clear all sessions on startup for debugging
console.log('Clearing any existing sessions for debugging...');
userSessions.clear();
console.log('All sessions cleared.');

// Start server
function startServer() {
  console.log('Starting VMT Server...');
  loadMessageHistory();
  initNetworkDiscovery();
  initWebSocketServer();
  console.log('Server started successfully');
  console.log(`Local IP: ${getLocalIP()}`);
  console.log('WebSocket server on port 8080');
  console.log('Discovery server on port 8081');

  // Display current user sessions
  setTimeout(() => {
    console.log(`Current user sessions: ${userSessions.size}`);
    if (userSessions.size > 0) {
      console.log('Active users:');
      for (const [userId, session] of userSessions) {
        console.log(`  - ${session.username} (${userId})`);
      }
    }
  }, 1000);
}

startServer();