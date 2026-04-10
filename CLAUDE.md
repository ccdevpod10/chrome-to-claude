# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome Extension that sends tasks to a local Python bridge, which invokes the Claude Code CLI and returns the response back to the extension.

```
Chrome Extension (popup/content script)
  → background service worker
    → Python bridge (HTTP or Native Messaging)
      → Claude Code CLI (`claude -p "..."`)
        → Anthropic API
```

## Tech Stack

| Layer | Technology |
|---|---|
| Browser extension | Chrome MV3 (Manifest V3) |
| Extension logic | JavaScript (ES2022, service worker) |
| Local bridge | Python 3.10+, FastAPI, uvicorn |
| CLI invocation | `claude -p` subprocess |
| IPC (Phase 4) | Chrome Native Messaging (stdin/stdout, length-prefixed JSON) |

## Directory Structure

```
extension/          # Chrome MV3 extension files
  manifest.json     # MV3 manifest with activeTab, scripting, storage permissions
  background.js     # Service worker — all bridge comms
  content.js        # Injected into pages — extracts URL, title, selected text
  popup.html/js     # Extension popup UI
bridge/
  server.py         # FastAPI HTTP bridge (Phases 1–3), runs on port 8765
  native_host.py    # Native Messaging host (Phase 4), stdin/stdout JSON
  context_assembler.py  # Merges skill instructions + page context + task into final prompt
  skill_router.py   # Keyword-based routing to select SKILL.md
  skills/           # SKILL.md files: default.md, code.md, summarise.md
host-manifest/
  com.myapp.bridge.json  # Native Messaging host manifest (Phase 4)
install.sh / install.ps1  # Register native host on macOS/Linux/Windows
```

## Development Commands

### Bridge (Python)

```bash
cd bridge
pip install fastapi uvicorn
uvicorn server:app --port 8765 --reload

# Test the bridge
curl -X POST http://localhost:8765/task \
  -H "Content-Type: application/json" \
  -d '{"prompt": "say hello in one sentence", "context": {}}'

# Health check
curl http://localhost:8765/health
```

### Extension (Chrome)

Load unpacked: `chrome://extensions` → enable Developer mode → Load unpacked → select `extension/`

### Register Native Host (Phase 4, macOS)

```bash
cp host-manifest/com.myapp.bridge.json \
  ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

Native host registration paths:
- macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- Linux: `~/.config/google-chrome/NativeMessagingHosts/`
- Windows: Registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.myapp.bridge`

## Architecture: Two IPC Modes

**Phases 1–3 (HTTP):** Extension `fetch()`es `http://localhost:8765/task`. CORS middleware allows `chrome-extension://*`. Bridge invokes `claude -p` as subprocess.

**Phase 4 (Native Messaging):** Chrome spawns the Python host directly via `chrome.runtime.connectNative("com.myapp.bridge")`. Messages are 4-byte little-endian length-prefixed JSON on stdin/stdout. No port, no CORS, no server to start manually.

## Key Gotchas

- **Service worker lifecycle:** Chrome MV3 service workers terminate after ~30s of inactivity. Never store state in module-level variables — use `chrome.storage.session` instead.
- **Native Messaging paths must be absolute:** The `"path"` in the host manifest must be an absolute path to the Python interpreter. Hardcode the full path to `claude` (e.g. `/usr/local/bin/claude`) since Chrome spawns native hosts with a minimal environment where PATH may not include it.
- **Extension ID changes** when reloading unpacked extensions — update `allowed_origins` in the host manifest after each reload. The ID stabilises once you publish or use a fixed key in the manifest.
- **CORS preflight:** Ensure `allow_headers=["Content-Type"]` is in FastAPI's `CORSMiddleware` or `fetch()` will fail silently.

## Implementation Phases

The plan is documented in `chrome-extension-claude-code-plan.md`. Phases:
1. Python HTTP bridge (`bridge/server.py`)
2. Chrome Extension scaffold (all `extension/` files)
3. Context assembly and skill routing (`context_assembler.py`, `skill_router.py`)
4. Upgrade to Native Messaging (`native_host.py`, host manifest, `install.sh`)
5. Polish: streaming SSE responses, conversation history, settings page
