#!/bin/bash

# Generate random keys for JWT_SECRET and AES_SECRET_KEY
JWT_SECRET=$(openssl rand -hex 32)
AES_SECRET_KEY=$(openssl rand -hex 32)

# Export environment variables
export JWT_SECRET="$JWT_SECRET"
export AES_SECRET_KEY="$AES_SECRET_KEY"

# Optional: Write to .env file
echo "JWT_SECRET=$JWT_SECRET" > .env
echo "AES_SECRET_KEY=$AES_SECRET_KEY" >> .env

echo "Environment variables set:"
echo "JWT_SECRET: $JWT_SECRET"
echo "AES_SECRET_KEY: $AES_SECRET_KEY"
echo "Keys also saved to .env file."