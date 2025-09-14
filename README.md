# QuickMessenger

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

QuickMessenger is a secure, real-time messaging and file-sharing application built with Electron, WebSocket, and advanced encryption. Designed for local network communication, it ensures privacy through RSA key exchange, AES encryption, and multi-factor authentication.

## Architecture

- **Server**: Standalone Node.js server that manages WebSocket connections, user sessions, message history, JWT-based authentication, and MFA
- **Client**: Electron application that connects to the server with password-protected access and strong password policies
- **Encryption**: End-to-end encryption using RSA key exchange and AES session keys with database encryption
- **Authentication**: JWT tokens with AES-encrypted user IDs protected by user passwords and IP validation
- **Security**: Multi-factor authentication (TOTP), audit logging, HTTPS/WSS support
- **Discovery**: UDP-based automatic server discovery on local network
- **External Access**: nginx reverse proxy for external connections

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Required)

Create a `.env` file in the project root with the following environment variables for security:

```bash
JWT_SECRET=your-secure-jwt-secret-key-here
AES_SECRET_KEY=your-secure-aes-secret-key-here
DB_ENCRYPTION_KEY=your-secure-db-encryption-key-here
RSA_PUBLIC_KEY="-----BEGIN RSA PUBLIC KEY-----\n...\n-----END RSA PUBLIC KEY-----\n"
RSA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

These environment variables are required for the server to start. Generate RSA key pairs using:

```bash
openssl genrsa -out key.pem 2048
openssl rsa -in key.pem -pubout -out cert.pem
```

Or use the provided setup script: `./setup_env.sh`

### 3. Generate SSL Certificates (for HTTPS)

Generate self-signed SSL certificates for HTTPS/WSS support:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

### 4. Start the Server

Run the server on the machine that will act as the central server:

```bash
node server.js
```

The server will start on:
- HTTPS WebSocket: port 8080 (WSS)
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
2. Connect to the first available server using WSS
3. Fall back to localhost if no server is found
4. Prompt for app password setup on first run
5. Enable MFA (TOTP) for enhanced security

## Features

### Core Features
- **User Registration**: Users register with the server (duplicate usernames not allowed)
- **Real-time Messaging**: Send messages to all users or specific users
- **File Sharing**: Share files up to 5GB
- **Message History**: Server maintains persistent message history
- **User Matching**: Server handles user connections and disconnections
- **Username Changes**: Users can change their username (duplicate check enforced)
- **Persistent User Identification**: Users maintain identity across app restarts using encrypted tokens
- **Automatic Discovery**: Clients automatically find servers on the network
- **External Access**: nginx proxy allows connections from outside the local network

### Security Features
- **Multi-Factor Authentication (MFA)**: TOTP-based 2FA for enhanced security
- **Strong Password Policies**: 8+ characters with mixed case, numbers, and symbols
- **End-to-End Encryption**: RSA + AES hybrid encryption for all communications
- **Database Encryption**: AES-encrypted user database and audit logs
- **HTTPS/WSS Support**: Secure WebSocket connections with SSL certificates
- **Audit Logging**: Encrypted security event logging
- **JWT with IP Validation**: Secure token-based authentication with IP address checking
- **Password Protection**: App-level password lock for security

## Configuration

### Server Configuration

The server automatically:
- Saves message history to `message_history.json`
- Listens on all interfaces (0.0.0.0)
- Uses UDP broadcast for discovery

#### Environment Variables
Set the following environment variables for production:
- `JWT_SECRET`: Secret key for JWT token signing (required)
- `AES_SECRET_KEY`: Secret key for AES encryption and session key protection (required)
- `DB_ENCRYPTION_KEY`: Secret key for database and audit log encryption (required)
- `RSA_PUBLIC_KEY`: RSA public key for key exchange (optional, auto-generated if not provided)
- `RSA_PRIVATE_KEY`: RSA private key for key exchange (optional, auto-generated if not provided)

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

## Security Overview

### Encryption Architecture
The application uses a multi-layer encryption approach:

#### RSA Encryption Usage
RSA (Rivest-Shamir-Adleman) is an asymmetric cryptographic algorithm used for secure key exchange:

1. **Server Key Generation**: On startup, the server generates or loads an RSA key pair (public/private).
2. **Public Key Sharing**: The server's public key is sent to connecting clients.
3. **Session Key Exchange**:
   - Server generates a random AES session key.
   - Encrypts the session key with the client's RSA public key.
   - Sends the double-encrypted session key to the client.
4. **Message Encryption**: All subsequent messages are encrypted with the AES session key.

#### AES Encryption Usage
AES (Advanced Encryption Standard) is used for:
- **Session Keys**: Per-connection symmetric encryption for messages
- **Database**: User database encryption with DB_ENCRYPTION_KEY
- **Audit Logs**: Security event logging encryption
- **Double Encryption**: Session keys are encrypted with both RSA and AES

#### Multi-Factor Authentication (MFA)
- **TOTP Implementation**: Time-based One-Time Password using speakeasy library
- **Secret Generation**: Unique TOTP secret generated per user
- **Verification**: Server validates TOTP codes during authentication

### Token and Password Handling
The authentication system follows these steps:

1. **Initial Registration**:
   - User enters username and password (must meet strong password requirements).
   - Password is RSA-encrypted with the server's public key and sent.
   - Server decrypts password, generates a user ID and TOTP secret.
   - User ID is AES-encrypted with the password, signed into a JWT token with IP validation.
   - Token is returned to the client.

2. **Reconnection**:
   - Stored token is sent to the server.
   - Server verifies the token, IP address, and decrypts the user ID.
   - Password match is confirmed for authentication.
   - MFA (TOTP) verification if enabled.

3. **Security Measures**:
   - Passwords are not stored in localStorage; only tokens are kept.
   - Tokens expire in 12 hours with IP address validation.
   - Secrets (JWT_SECRET, AES_SECRET_KEY, DB_ENCRYPTION_KEY) are managed via environment variables.
   - Database and audit logs are AES-encrypted.

## Security Notes

- **End-to-End Encryption**: RSA + AES hybrid encryption for all communications
- **Multi-Factor Authentication**: TOTP-based 2FA for enhanced account security
- **Database Encryption**: AES-encrypted user database and audit logs
- **HTTPS/WSS Support**: Secure WebSocket connections with SSL certificates
- **Message Encryption**: Messages are encrypted using per-session AES keys
- **User Authentication**: JWT-based authentication with AES-encrypted user IDs protected by user passwords and IP validation
- **Token Security**: JWT tokens expire in 12 hours with IP address validation; require password for user ID decryption
- **Key Management**: 2048-bit RSA keys for secure key exchange, unique AES session keys per connection
- **Password Protection**: App-level password lock with strong password policies
- **Audit Logging**: Encrypted security event logging for monitoring
- **File Security**: File size is limited to 5GB with validation
- **Production Recommendations**: Use environment variables for all secrets, implement HTTPS, regularly rotate encryption keys, and enable MFA

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

## Contributing

1. Fork the repository.
2. Improve the code.
3. Submit a pull request.

Please focus on security improvements and follow the existing code style.

## Screenshots

![Image](https://github.com/user-attachments/assets/e707a0e9-ad92-4dce-8846-05c616d1f26a)
![Image](https://github.com/user-attachments/assets/b0aebe09-0caf-4463-85b7-78ac32ef80e0)
![Image](https://github.com/user-attachments/assets/99ed70c2-cd7a-405c-a861-036484bc8fb1)

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Support

For issues or questions, please open an issue on GitHub.
