 require('dotenv').config();

 const WebSocket = require('ws');
 const crypto = require('crypto-js');
 const cryptoNode = require('crypto');
 const fs = require('fs');
 const os = require('os');
 const dgram = require('dgram');
 const path = require('path');
 const jwt = require('jsonwebtoken');



// Check for required environment variables
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required');
  process.exit(1);
}
if (!process.env.AES_SECRET_KEY) {
  console.error('Error: AES_SECRET_KEY environment variable is required');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const AES_SECRET_KEY = process.env.AES_SECRET_KEY;



// Generate RSA key pair for server
const { publicKey: serverPublicKey, privateKey: serverPrivateKey } = cryptoNode.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

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
      console.log(`New client connected: ${clientId}`);
      fs.appendFileSync(path.join(__dirname, 'server_debug.log'), `[${new Date().toISOString()}] New client connected: ${clientId}\n`);
      clients.set(clientId, ws);

      // Send server public key to client
      console.log('Sending server public key to client');
      const publicKeyMessage = JSON.stringify({
        type: 'server_public_key',
        publicKey: serverPublicKey
      });
      console.log('Public key message length:', publicKeyMessage.length);
      ws.send(publicKeyMessage);
      console.log('Server public key sent to client');

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
      if (!ws.sessionKey) {
        console.error('Session key not established for encrypted message');
        return;
      }
      const decrypted = crypto.AES.decrypt(data.content, ws.sessionKey).toString(crypto.enc.Utf8);
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
        case 'client_public_key':
          // Store client public key and decrypt session key
          ws.clientPublicKey = data.publicKey;
          const encryptedSessionKey = Buffer.from(data.encryptedSessionKey, 'base64');
          ws.sessionKey = cryptoNode.privateDecrypt(serverPrivateKey, encryptedSessionKey).toString();
          console.log('Session key established for client:', clientId);
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
         // Check if password is provided
         // First decrypt the password if it's encrypted
         let tokenPassword = data.password;
         if (data.passwordEncrypted && data.password) {
           try {
             tokenPassword = cryptoNode.privateDecrypt(serverPrivateKey, Buffer.from(data.password, 'base64')).toString();
             console.log(`Password decrypted for token validation: "${tokenPassword}"`);
           } catch (error) {
             console.log('Password decryption failed for token validation:', error.message);
             tokenPassword = data.password; // Fall back to original
           }
         }

         if (!tokenPassword) {
           console.log('No password available for token validation, trying with empty string');
           // Try with empty string for backward compatibility
           try {
             decryptedUserId = crypto.AES.decrypt(decoded.encryptedUserId, '').toString(crypto.enc.Utf8);
             console.log(`Token decoded with empty password: encrypted userId decrypted to "${decryptedUserId}"`);
           } catch (error) {
             throw new Error('Password required for token validation');
           }
         } else {
           // Decrypt encrypted userId with the decrypted password
           console.log(`Decrypting token with password: "${tokenPassword}"`);
           decryptedUserId = crypto.AES.decrypt(decoded.encryptedUserId, tokenPassword).toString(crypto.enc.Utf8);
           console.log(`Token decoded: encrypted userId decrypted to "${decryptedUserId}", issued at ${new Date(decoded.iat * 1000)}, expires at ${new Date(decoded.exp * 1000)}`);
         }
         console.log(`Comparing: decrypted="${decryptedUserId}", received="${data.userId}"`);
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
         console.log(`Expected userId: ${decryptedUserId}, received userId: ${data.userId}`);
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
  // Decrypt password if encrypted
  console.log(`Received password: "${data.password}" (encrypted: ${data.passwordEncrypted})`);
  let decryptedPassword = data.password;
  if (data.passwordEncrypted && data.password) {
    try {
      decryptedPassword = cryptoNode.privateDecrypt(serverPrivateKey, Buffer.from(data.password, 'base64')).toString();
      console.log(`Password decrypted with server private key: "${decryptedPassword}"`);
    } catch (error) {
      console.log('Password decryption failed:', error.message);
      // Fall back to original password if decryption fails
      decryptedPassword = data.password;
    }
  } else if (!data.password) {
    console.log('No password provided, using empty string');
    decryptedPassword = '';
  }

  // Encrypt userId with decrypted password
  console.log(`Encrypting userId "${userId}" with password "${decryptedPassword}"`);
  const encryptedUserId = crypto.AES.encrypt(userId, decryptedPassword).toString();
  console.log(`Encrypted userId: ${encryptedUserId}`);

  // Generate JWT token with encrypted userId
  const token = jwt.sign({ encryptedUserId }, JWT_SECRET, { expiresIn: '24h' });
  console.log(`Generated token: ${token}`);

  const response = {
    type: 'registration_success',
    userId: userId,
    username: data.username,
    token: token
  };

  // Encrypt response with session key
  if (ws.sessionKey) {
    const encrypted = crypto.AES.encrypt(JSON.stringify(response), ws.sessionKey).toString();
    const packet = {
      type: 'encrypted',
      content: encrypted
    };
    ws.send(JSON.stringify(packet));
  } else {
    // Fallback to plain text if session key not established
    ws.send(JSON.stringify(response));
  }
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
  console.log(`=== HANDLING USERNAME CHANGE ===`);
  console.log(`Username change request from userId ${ws.userId}: '${ws.username}' -> '${data.newUsername}'`);
  console.log(`WebSocket userId: ${ws.userId}, username: ${ws.username}`);
  console.log(`Request data:`, data);
  if (ws.username && data.newUsername) {
    // Check for duplicate username (excluding current user)
    for (const [existingUserId, session] of userSessions) {
      if (session.username === data.newUsername && existingUserId !== ws.userId) {
        // Username already exists, reject change
        const errorResponse = {
          type: 'username_change_error',
          error: 'Username already in use. Please choose a different username.'
        };
        const encrypted = crypto.AES.encrypt(JSON.stringify(errorResponse), AES_SECRET_KEY).toString();
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
    console.log(`Broadcasting username change notification:`, changeNotification);
    broadcastMessage(changeNotification);

    console.log(`Broadcasting updated user list after username change`);
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

  const encrypted = crypto.AES.encrypt(JSON.stringify(pongMessage), AES_SECRET_KEY).toString();
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

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.sessionKey) {
      const encrypted = crypto.AES.encrypt(JSON.stringify(message), client.sessionKey).toString();
      const packet = {
        type: 'encrypted',
        content: encrypted
      };
      client.send(JSON.stringify(packet));
    }
  });
}

// Send message to specific user
function sendToUser(userId, message) {
  if (!wss) return;

  wss.clients.forEach(client => {
    if (client.userId === userId && client.readyState === WebSocket.OPEN && client.sessionKey) {
      const encrypted = crypto.AES.encrypt(JSON.stringify(message), client.sessionKey).toString();
      const packet = {
        type: 'encrypted',
        content: encrypted
      };
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