# Design: Go Bridge Executable (Mac / Windows / Linux)

**Date:** 2026-04-11
**Status:** Approved

---

## Problem

The Python bridge (`bridge/server.py`) requires Python 3.10+ and manually running `uvicorn` from a terminal. This is a poor experience for end-users who just want to install and run the extension. The goal is a self-contained executable that any user can double-click.

## Goals

- Single binary per platform, no runtime dependencies (no Python, no Node)
- System tray presence — start/stop/restart without touching a terminal
- Skill files (default.md, code.md, summarise.md) are editable after install
- GitHub Actions produces signed-ready zip artifacts for Mac (arm64 + amd64), Linux (amd64), and Windows (amd64) on every `v*` tag push

## Approach: Go + systray

Rewrite the bridge in Go. The HTTP server logic is a direct translation of the existing Python. The `github.com/getlantern/systray` library provides a cross-platform tray icon. Skill files are embedded in the binary as defaults and seeded to the user's config directory on first run.

---

## Architecture

### Repository layout

```
bridge-go/
├── main.go          # tray icon lifecycle, starts/stops HTTP server
├── server.go        # HTTP handlers: GET /health, POST /task, POST /task/stream
├── router.go        # skill routing: keyword matching → skill filename
├── assembler.go     # context assembly: skill + page context + history → prompt string
├── claude.go        # claude binary discovery (searches common install paths) + subprocess
├── go.mod
└── go.sum
```

The existing `bridge/` Python directory is kept for reference but is no longer the active implementation.

### Config & skill files

On first launch the binary seeds user-editable defaults:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/claude-bridge/skills/` |
| Linux | `~/.config/claude-bridge/skills/` |
| Windows | `%APPDATA%\claude-bridge\skills\` |

Skill files are read from disk on every request — edits are live without restarting.

### HTTP API (unchanged)

The Go binary exposes the same endpoints as the Python bridge so the extension requires no changes:

- `GET  /health` → `{"status":"ok"}`
- `POST /task` → `{"result":"…","error":"…"}`
- `POST /task/stream` → SSE stream of `data: {"token":"…"}` events, terminated by `data: [DONE]`

Request body: `{"prompt":"…","context":{…},"history":[…],"model":"…"}`

### claude binary discovery

`claude.go` searches in order:
1. `CLAUDE_BIN` environment variable
2. `~/.local/bin/claude`
3. `/usr/local/bin/claude`
4. `/opt/homebrew/bin/claude`
5. `PATH` via `exec.LookPath`

Fails loudly if not found (error returned in the response JSON, tray status updated).

---

## Tray Icon UX

```
● Claude Bridge
─────────────────────
  Status: Running on :8765
─────────────────────
  Stop Bridge
  Restart Bridge
─────────────────────
  Open Skills Folder
─────────────────────
  Quit
```

- Green dot icon = server running; grey = stopped
- **Stop/Start** toggles the HTTP server goroutine without exiting
- **Restart** — stop + start (useful after editing skill files)
- **Open Skills Folder** — `open` (macOS) / `xdg-open` (Linux) / `explorer` (Windows) the config dir
- **Quit** — graceful shutdown of server + exit

The tray icon is a 32×32 PNG baked into the binary via `//go:embed`.

---

## Build & CI

### Local

```bash
brew install go          # or equivalent
cd bridge-go
go run .                 # run without building
go build -o claude-bridge
```

### GitHub Actions — `.github/workflows/release.yml`

Triggered on `push` to tags matching `v*`.

| Job | Runner | Output artifact |
|---|---|---|
| `build-macos-arm64` | `macos-latest` | `claude-bridge-macos-arm64.zip` |
| `build-macos-amd64` | `macos-latest` | `claude-bridge-macos-amd64.zip` |
| `build-linux-amd64` | `ubuntu-latest` | `claude-bridge-linux-amd64.tar.gz` |
| `build-windows-amd64` | `windows-latest` | `claude-bridge-windows-amd64.zip` |

Each archive contains:
- The binary (`claude-bridge` or `claude-bridge.exe`)
- `README.txt` with first-run instructions

Artifacts are uploaded to the GitHub Release via `softprops/action-gh-release`.

> macOS builds require CGO (for the tray library) and must run on a macOS runner. Other targets could cross-compile but separate runners keeps things clean and avoids CGO complexity.

---

## Go dependencies

| Package | Purpose |
|---|---|
| `github.com/getlantern/systray` | Cross-platform system tray icon + menu |

Everything else (HTTP server, subprocess, file I/O, embed, SSE) uses Go stdlib.

---

## Out of scope

- Code signing / notarization (macOS Gatekeeper warning on first run is acceptable for now)
- Auto-update mechanism
- Settings UI inside the tray (port change still done via the extension's options page)
- Installer packages (.dmg, .msi, .deb) — zip archives are sufficient for v1
