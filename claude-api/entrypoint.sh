#!/bin/bash
set -euo pipefail

# Credentials: prefer credentials.json over ANTHROPIC_API_KEY
CREDS_PATH="/credentials/.credentials.json"
if [ -f "$CREDS_PATH" ]; then
  echo "==> Using credentials.json for authentication (via CLAUDE_CONFIG_DIR)"
  export CLAUDE_CONFIG_DIR="/credentials"
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "==> Using ANTHROPIC_API_KEY for authentication"
else
  echo "ERROR: No credentials.json or ANTHROPIC_API_KEY provided"
  exit 1
fi

# Point the SDK at our local intercept server
export ANTHROPIC_BASE_URL="http://localhost:9999"

# Install dependencies
echo "==> Installing dependencies..."
cd /capture
bun install

# Start the intercept server in the background
echo "==> Starting intercept server..."
bun run intercept-server.ts &
INTERCEPT_PID=$!

# Wait for it to be ready
sleep 1

# Run the SDK capture
echo "==> Running SDK capture..."
bun run capture.ts || true

# Give the intercept server a moment to flush writes
sleep 1

# Check result
if [ -f /api-debug/api.json ]; then
  echo "==> Success! Captured API request to /api-debug/api.json"
  echo "==> Contents:"
  cat /api-debug/api.json
else
  echo "==> WARNING: No api.json was captured"
fi

# Clean up
kill $INTERCEPT_PID 2>/dev/null || true
echo "==> Done."
