#!/usr/bin/env bash
# install.sh — Register the Claude Code Bridge native messaging host
# Usage: bash install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_HOST_SCRIPT="$SCRIPT_DIR/bridge/native_host.py"
MANIFEST_TEMPLATE="$SCRIPT_DIR/host-manifest/com.myapp.bridge.json"

# ── Preflight checks ──────────────────────────────────────────────────────

if [ ! -f "$NATIVE_HOST_SCRIPT" ]; then
  echo "Error: $NATIVE_HOST_SCRIPT not found. Run this script from the project root." >&2
  exit 1
fi

CLAUDE_PATH="$(which claude 2>/dev/null || true)"
if [ -z "$CLAUDE_PATH" ]; then
  echo "Warning: 'claude' not found in PATH."
  echo "The native host will fail at runtime. Install Claude Code first:"
  echo "  https://claude.ai/code"
  echo ""
fi

# ── Detect OS and set registration path ──────────────────────────────────

OS="$(uname -s)"
case "$OS" in
  Darwin)
    HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  Linux)
    HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
  *)
    echo "Error: Unsupported OS '$OS'. On Windows, run install.ps1 instead." >&2
    exit 1
    ;;
esac

# ── Install ───────────────────────────────────────────────────────────────

mkdir -p "$HOST_DIR"

# Substitute __NATIVE_HOST_PATH__ in the template
sed "s|__NATIVE_HOST_PATH__|${NATIVE_HOST_SCRIPT}|g" \
  "$MANIFEST_TEMPLATE" > "$HOST_DIR/com.myapp.bridge.json"

chmod +x "$NATIVE_HOST_SCRIPT"

# ── Done ──────────────────────────────────────────────────────────────────

echo ""
echo "✓ Native host manifest installed:"
echo "  $HOST_DIR/com.myapp.bridge.json"
echo ""
echo "✓ Native host script is executable:"
echo "  $NATIVE_HOST_SCRIPT"
echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo "Next steps:"
echo ""
echo "1. Load the extension in Chrome:"
echo "   chrome://extensions → Enable 'Developer mode' → 'Load unpacked'"
echo "   → Select: $SCRIPT_DIR/extension"
echo ""
echo "2. Copy your extension ID from chrome://extensions"
echo ""
echo "3. Update allowed_origins in the installed manifest:"
echo "   $HOST_DIR/com.myapp.bridge.json"
echo "   Replace  YOUR_EXTENSION_ID  with the real ID."
echo ""
echo "4. In extension/background.js, set:  const USE_NATIVE = true;"
echo "   Then reload the extension."
echo "─────────────────────────────────────────────────────────────────────"
