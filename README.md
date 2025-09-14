# QuickMessenger - Client-Server Architecture

This application has been converted from a P2P architecture to a client-server architecture. The server handles user matching and message recording, while clients connect to the server for messaging.

## Architecture

- **Server**: Standalone Node.js server that manages WebSocket connections, user sessions, message history, and JWT-based authentication
- **Client**: Electron application that connects to the server with password-protected access
- **Encryption**: End-to-end encryption using RSA key exchange and AES session keys
- **Authentication**: JWT tokens with AES-encrypted user IDs protected by user passwords
- **Discovery**: UDP-based automatic server discovery on local network
- **External Access**: nginx reverse proxy for external connections

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Required)

Set the following environment variables for security:

```bash
export JWT_SECRET="your-secure-jwt-secret-key-here"
export AES_SECRET_KEY="your-secure-aes-secret-key-here"
```

These environment variables are required for the server to start. The application automatically generates RSA key pairs for encryption.

### 3. Start the Server

Run the server on the machine that will act as the central server:

```bash
npm run server
```

The server will start on:
- WebSocket: port 8080
- Discovery: port 8081
- Local IP will be displayed in the console

### 4. Configure nginx (for external access)

1. Install nginx on your server machine
2. Copy `nginx.conf` to `/etc/nginx/nginx.conf` (or appropriate location)
3. Edit the server block to match your domain/IP
4. Reload nginx:

```bash
sudo nginx -t
sudo nginx -s reload
```

### 5. Start Clients

On client machines, start the Electron app:

```bash
npm start
```

The client will automatically:
1. Discover servers on the local network
2. Connect to the first available server
3. Fall back to localhost if no server is found

## Features

- **User Registration**: Users register with the server (duplicate usernames not allowed)
- **Real-time Messaging**: Send messages to all users or specific users
- **File Sharing**: Share files up to 5GB
- **Message History**: Server maintains persistent message history
- **User Matching**: Server handles user connections and disconnections
- **Username Changes**: Users can change their username (duplicate check enforced)
- **Persistent User Identification**: Users maintain identity across app restarts using encrypted tokens
- **Password Protection**: App-level password lock for security
- **End-to-End Encryption**: RSA + AES encryption for all communications
- **Automatic Discovery**: Clients automatically find servers on the network
- **External Access**: nginx proxy allows connections from outside the local network

## Configuration

### Server Configuration

The server automatically:
- Saves message history to `message_history.json`
- Listens on all interfaces (0.0.0.0)
- Uses UDP broadcast for discovery

#### Environment Variables
Set the following environment variable for production:
- `JWT_SECRET`: Secret key for JWT token signing (required environment variable)
- `AES_SECRET_KEY`: Secret key for AES encryption (required environment variable)

### Client Configuration

Clients will try to:
1. Discover servers via UDP broadcast
2. Connect to discovered servers
3. Fall back to localhost

### nginx Configuration

The provided `nginx.conf`:
- Proxies WebSocket connections
- Handles static files if needed
- Includes security headers
- Can be extended for HTTPS

## Security Notes

- **End-to-End Encryption**: RSA key exchange establishes secure AES session keys for all communications
- **Message Encryption**: Messages are encrypted using per-session AES keys
- **User Authentication**: JWT-based authentication with AES-encrypted user IDs protected by user passwords
- **Token Security**: JWT tokens expire in 24 hours and require password for user ID decryption; legacy token formats are not supported
- **Key Management**: 2048-bit RSA keys for secure key exchange, unique AES session keys per connection
- **Password Protection**: App-level password lock prevents unauthorized access
- **File Security**: File size is limited to 5GB with validation
- **Production Recommendations**: Use environment variables for JWT_SECRET, implement HTTPS, and regularly rotate encryption keys

## Troubleshooting

### Server Issues
- Check if ports 8080 and 8081 are available
- Verify firewall settings allow UDP broadcast
- Check server logs for connection errors

### Client Issues
- Ensure server is running and accessible
- Check network connectivity
- Verify UDP broadcast is not blocked
- If encryption fails, try restarting the app to regenerate keys

### nginx Issues
- Check nginx configuration syntax
- Verify proxy settings
- Check firewall allows port 80/443