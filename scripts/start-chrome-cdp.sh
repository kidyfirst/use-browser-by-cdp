#!/usr/bin/env bash

# ==============================================================================
# Bulletproof Chrome CDP Remote Debugging Launcher (macOS / Linux)
# Port: 9222
# User Profile: ~/.moni-chrome-cdp-profile
# ==============================================================================

set -e

PORT=${1:-9222}
PROFILE_DIR="$HOME/.moni-chrome-cdp-profile"

echo ""
echo "========================================"
echo "⚡ Moni Chrome CDP Debug Launcher (Bash)"
echo "========================================"
echo ""

# 1. Check if port is already listening
if curl -s -m 1 "http://127.0.0.1:${PORT}/json/version" > /dev/null 2>&1; then
  echo "✅ Chrome CDP is ALREADY running on http://127.0.0.1:${PORT}!"
  curl -s "http://127.0.0.1:${PORT}/json/version" | grep -E '"(Browser|webSocketDebuggerUrl)"' || true
  echo ""
  echo "🎉 No need to launch again. Ready to automate!"
  exit 0
fi

# 2. Locate Chrome binary
CHROME_BIN=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  CANDIDATES=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  )
else
  CANDIDATES=(
    "$(which google-chrome 2>/dev/null || true)"
    "$(which google-chrome-stable 2>/dev/null || true)"
    "$(which chromium 2>/dev/null || true)"
    "$(which chromium-browser 2>/dev/null || true)"
  )
fi

for bin in "${CANDIDATES[@]}"; do
  if [ -n "$bin" ] && [ -x "$bin" ]; then
    CHROME_BIN="$bin"
    break
  fi
done

if [ -z "$CHROME_BIN" ]; then
  echo "❌ Error: Google Chrome executable not found."
  echo "   Please install Google Chrome or set CHROME_PATH."
  exit 1
fi

echo "🚀 Found Chrome: $CHROME_BIN"
echo "📁 Profile directory: $PROFILE_DIR"

# 3. Clean stale locks
mkdir -p "$PROFILE_DIR"
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie" 2>/dev/null || true

# 4. Launch Chrome with robust flags in background
echo "⚡ Starting Chrome on port ${PORT}..."

"$CHROME_BIN" \
  --remote-debugging-port="${PORT}" \
  --remote-allow-origins="*" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking \
  --disable-popup-blocking > /dev/null 2>&1 &

CHROME_PID=$!

# 5. Wait for port to become ready
echo "⏳ Waiting for CDP port ${PORT} to respond..."
READY=0
for i in {1..20}; do
  if curl -s -m 1 "http://127.0.0.1:${PORT}/json/version" > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.3
done

if [ $READY -eq 1 ]; then
  echo ""
  echo "✅ Chrome launched successfully with CDP port ${PORT}!"
  curl -s "http://127.0.0.1:${PORT}/json/version" | grep -E '"(Browser|webSocketDebuggerUrl)"' || true
  echo ""
  echo "🎉 Cookies and logins are preserved in $PROFILE_DIR"
else
  echo "❌ Timeout waiting for port ${PORT} to respond."
  exit 1
fi
