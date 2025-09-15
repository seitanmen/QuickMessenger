#!/bin/bash

echo "=== QuickMessenger Environment Setup ==="
echo "This script will generate all necessary keys and certificates for secure operation."
echo ""

# Check if .env file already exists
if [ -f ".env" ]; then
    echo "Warning: .env file already exists. This will overwrite it."
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 1
    fi
fi

echo "Generating cryptographic keys and certificates..."
echo ""

# Generate random keys
echo "1. Generating JWT secret..."
JWT_SECRET=$(openssl rand -hex 32)

echo "2. Generating AES secret key..."
AES_SECRET_KEY=$(openssl rand -hex 32)

echo "3. Generating database encryption key..."
DB_ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "4. Generating RSA key pair..."
# Generate RSA private key
openssl genrsa -traditional -out key.pem 2048 2>/dev/null
# Extract public key
RSA_PRIVATE_KEY=$(cat key.pem)
RSA_PUBLIC_KEY=$(openssl rsa -in key.pem -RSAPublicKey_out 2>/dev/null | sed '1d;$d' | tr -d '\n')

echo "5. Generating SSL certificates..."
# Generate self-signed certificate for HTTPS
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=QuickMessenger/CN=localhost" 2>/dev/null

# Format RSA keys for .env file
# Extract base64 data from private key (remove headers/footers and clean)
PRIVATE_KEY_DATA=$(echo "$RSA_PRIVATE_KEY" | sed '1d;$d' | tr -d '\n')
RSA_PRIVATE_KEY_FORMATTED="\"-----BEGIN RSA PRIVATE KEY-----\n$(echo "$PRIVATE_KEY_DATA" | fold -w 64 | sed 's/$/\\n/' | tr -d '\n')-----END RSA PRIVATE KEY-----\n\""

# Format public key
RSA_PUBLIC_KEY_FORMATTED="\"-----BEGIN RSA PUBLIC KEY-----\n$(echo "$RSA_PUBLIC_KEY" | fold -w 64 | sed 's/$/\\n/' | tr -d '\n')-----END RSA PUBLIC KEY-----\n\""

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
# QuickMessenger Environment Configuration
# Generated on $(date)

# JWT Configuration
JWT_SECRET=$JWT_SECRET

# AES Encryption Keys
AES_SECRET_KEY=$AES_SECRET_KEY
DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY

# RSA Key Pair for Encryption
RSA_PUBLIC_KEY=$RSA_PUBLIC_KEY_FORMATTED
RSA_PRIVATE_KEY=$RSA_PRIVATE_KEY_FORMATTED
EOF

# Set permissions
chmod 600 .env
chmod 600 key.pem
chmod 644 cert.pem

echo ""
echo "=== Setup Complete ==="
echo "Generated files:"
echo "  - .env (environment variables)"
echo "  - cert.pem (SSL certificate)"
echo "  - key.pem (SSL private key)"
echo ""
echo "Environment variables:"
echo "  JWT_SECRET: ${JWT_SECRET:0:16}..."
echo "  AES_SECRET_KEY: ${AES_SECRET_KEY:0:16}..."
echo "  DB_ENCRYPTION_KEY: ${DB_ENCRYPTION_KEY:0:16}..."
echo "  RSA keys: Generated and configured"
echo ""
echo "SSL certificates: Generated for localhost"
echo ""
echo "You can now start the server with: node server.js"
echo ""
echo "⚠️  Security Notes:"
echo "  - Keep .env and key.pem files secure"
echo "  - Never commit these files to version control"
echo "  - Rotate keys periodically in production"