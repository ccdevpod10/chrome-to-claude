# Chrome Extension → Claude Code CLI — Implementation Plan

> Feed this file to Claude Code with:
> `claude -p "$(cat chrome-extension-claude-code-plan.md)"`
> Or open it as context: `claude` then `/add chrome-extension-claude-code-plan.md`

---

## Project overview

Build a Chrome Extension that sends tasks to a local Python bridge, which invokes the Claude Code CLI and returns the response back to the extension.

```
Chrome Extension (popup/content script)
  → background service worker
    → Python bridge (HTTP or Native Messaging)
      → Claude Code CLI  (`claude -p "..."`)
        → Anthropic API
          → response back to extension
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Browser extension | Chrome MV3 (Manifest V3) |
| Extension logic | JavaScript (ES2022, service worker) |
| Local bridge | Python 3.10+, FastAPI, uvicorn |
| CLI invocation | `claude -p` subprocess |
| IPC (phase 4) | Chrome Native Messaging (stdin/stdout, length-prefixed JSON) |
| Package manager | pip + npm (or pnpm) |

---

## Project structure

```
project-root/
├── extension/
│   ├── manifest.json          # MV3 manifest
│   ├── background.js          # service worker — all bridge comms
│   ├── content.js             # injected into pages — extracts DOM context
│   ├── popup.html             # extension popup UI
│   ├── popup.js               # popup logic
│   └── icons/                 # 16, 48, 128px icons
├── bridge/
│   ├── server.py              # FastAPI HTTP bridge (Phase 1–3)
│   ├── native_host.py         # Native Messaging host (Phase 4)
│   ├── context_assembler.py   # builds final prompt from parts
│   ├── skill_router.py        # selects which SKILL.md to load
│   └── skills/                # SKILL.md files per task type
│       ├── code.md
│       ├── summarise.md
│       └── default.md
├── host-manifest/
│   └── com.myapp.bridge.json  # Native Messaging host manifest (Phase 4)
├── install.sh                 # registers native host on macOS/Linux
├── install.ps1                # registers native host on Windows
└── README.md
```

---

## Phase 1 — Python HTTP bridge

**Goal:** A running local server that accepts a task, calls `claude -p`, and returns the result.

### Tasks

- [ ] Create `bridge/` directory, set up Python virtual environment
- [ ] Install dependencies: `pip install fastapi uvicorn`
- [ ] Implement `bridge/server.py` with a `POST /task` endpoint
- [ ] Invoke `claude -p "{prompt}"` as a subprocess, capture stdout
- [ ] Add CORS middleware allowing `chrome-extension://*` and `http://localhost`
- [ ] Add `GET /health` endpoint returning `{"status": "ok"}`
- [ ] Test with curl: `curl -X POST http://localhost:8765/task -H "Content-Type: application/json" -d '{"prompt":"say hello"}'`

### Key code shape — `bridge/server.py`

```python
import subprocess
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to chrome-extension://YOUR_ID later
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

class TaskRequest(BaseModel):
    prompt: str
    context: dict = {}   # page URL, selected text, etc.

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/task")
def run_task(req: TaskRequest):
    full_prompt = build_prompt(req.prompt, req.context)
    result = subprocess.run(
        ["claude", "-p", full_prompt, "--output-format", "text"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return {"result": result.stdout, "error": result.stderr}

def build_prompt(task: str, context: dict) -> str:
    parts = []
    if context.get("url"):
        parts.append(f"Page URL: {context['url']}")
    if context.get("selected_text"):
        parts.append(f"Selected text:\n{context['selected_text']}")
    parts.append(f"Task: {task}")
    return "\n\n".join(parts)
```

Run with: `uvicorn bridge.server:app --port 8765 --reload`

---

## Phase 2 — Chrome Extension scaffold

**Goal:** A working extension that sends tasks to the bridge and shows responses.

### Tasks

- [ ] Create `extension/manifest.json` (MV3) with correct permissions
- [ ] Implement `extension/background.js` — receives messages, calls bridge, returns result
- [ ] Implement `extension/popup.html` + `popup.js` — text input, submit, result display
- [ ] Implement `extension/content.js` — extracts page URL and selected text, sends to background
- [ ] Load the extension unpacked in Chrome: `chrome://extensions` → "Load unpacked"
- [ ] Verify popup → background → bridge → response round trip works end-to-end

### Key code shape — `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Claude Code Bridge",
  "version": "0.1.0",
  "description": "Send tasks to Claude Code CLI from any webpage",
  "permissions": [
    "activeTab",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### Key code shape — `extension/background.js`

```javascript
const BRIDGE_URL = "http://localhost:8765";

// Check bridge is alive when extension loads
async function checkBridge() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// Main message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_TASK") {
    handleTask(message.payload).then(sendResponse);
    return true; // keep channel open for async response
  }
});

async function handleTask({ prompt, context }) {
  const alive = await checkBridge();
  if (!alive) {
    return { error: "Bridge not running. Start it with: uvicorn bridge.server:app --port 8765" };
  }
  try {
    const res = await fetch(`${BRIDGE_URL}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context }),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}
```

### Key code shape — `extension/content.js`

```javascript
// Listens for requests from background, returns page context
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CONTEXT") {
    sendResponse({
      url: window.location.href,
      title: document.title,
      selected_text: window.getSelection()?.toString() || "",
    });
  }
});
```

### Key code shape — `extension/popup.js`

```javascript
document.getElementById("submit").addEventListener("click", async () => {
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) return;

  setLoading(true);

  // Get page context from content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let context = {};
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTEXT" });
    context = response;
  } catch { /* tab may not have content script */ }

  // Send to background worker
  const result = await chrome.runtime.sendMessage({
    type: "RUN_TASK",
    payload: { prompt, context },
  });

  setLoading(false);
  document.getElementById("result").textContent = result.result || result.error;
});

function setLoading(on) {
  document.getElementById("submit").disabled = on;
  document.getElementById("result").textContent = on ? "Running..." : "";
}
```

---

## Phase 3 — Context assembly and skill routing

**Goal:** Bridge intelligently selects the right SKILL.md and assembles a rich prompt.

### Tasks

- [ ] Create `bridge/skills/` directory with at least `default.md`, `code.md`, `summarise.md`
- [ ] Implement `bridge/skill_router.py` — keyword/heuristic routing to pick the right skill
- [ ] Implement `bridge/context_assembler.py` — merges skill instructions + page context + task
- [ ] Update `bridge/server.py` to call the assembler before invoking Claude Code
- [ ] Test with tasks of different types to verify correct skill is selected

### Key code shape — `bridge/skill_router.py`

```python
import os

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")

ROUTING_RULES = [
    (["refactor", "fix", "debug", "write code", "function", "class", "python", "javascript"], "code.md"),
    (["summarise", "summarize", "tldr", "summary", "explain", "what is"], "summarise.md"),
]

def load_skill(filename: str) -> str:
    path = os.path.join(SKILLS_DIR, filename)
    if os.path.exists(path):
        with open(path) as f:
            return f.read()
    return ""

def route(task: str) -> str:
    task_lower = task.lower()
    for keywords, skill_file in ROUTING_RULES:
        if any(kw in task_lower for kw in keywords):
            return load_skill(skill_file)
    return load_skill("default.md")
```

### Key code shape — `bridge/context_assembler.py`

```python
from skill_router import route

def assemble(task: str, context: dict) -> str:
    parts = []

    skill_instructions = route(task)
    if skill_instructions:
        parts.append(f"## Instructions\n{skill_instructions}")

    if context.get("url"):
        parts.append(f"## Page context\nURL: {context['url']}\nTitle: {context.get('title', '')}")

    if context.get("selected_text"):
        parts.append(f"## Selected text\n{context['selected_text']}")

    parts.append(f"## Task\n{task}")

    return "\n\n---\n\n".join(parts)
```

---

## Phase 4 — Upgrade to Native Messaging

**Goal:** Replace HTTP server with OS-level Native Messaging — no port, no CORS, no server to start manually.

### How it works

Chrome starts your Python process directly. Messages are JSON objects framed with a 4-byte little-endian length prefix on stdin/stdout.

### Tasks

- [ ] Write `bridge/native_host.py` with the stdin/stdout message loop
- [ ] Write `host-manifest/com.myapp.bridge.json` — the host manifest
- [ ] Write `install.sh` / `install.ps1` to copy the manifest to the correct OS path
- [ ] Update `extension/manifest.json` — add `"nativeMessaging"` permission
- [ ] Update `extension/background.js` — switch to `chrome.runtime.connectNative()`
- [ ] Test: install native host, reload extension, verify messages flow without HTTP server

### Key code shape — `bridge/native_host.py`

```python
import sys
import json
import struct
import subprocess

def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        sys.exit(0)
    msg_len = struct.unpack("<I", raw_len)[0]
    return json.loads(sys.stdin.buffer.read(msg_len).decode("utf-8"))

def send_message(data: dict):
    encoded = json.dumps(data).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def main():
    while True:
        try:
            message = read_message()
            prompt = message.get("prompt", "")
            context = message.get("context", {})

            # reuse context assembler from Phase 3
            from context_assembler import assemble
            full_prompt = assemble(prompt, context)

            result = subprocess.run(
                ["claude", "-p", full_prompt, "--output-format", "text"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            send_message({"result": result.stdout, "error": result.stderr})
        except Exception as e:
            send_message({"error": str(e)})

if __name__ == "__main__":
    main()
```

### Key code shape — `host-manifest/com.myapp.bridge.json`

```json
{
  "name": "com.myapp.bridge",
  "description": "Claude Code CLI bridge for Chrome Extension",
  "path": "/absolute/path/to/bridge/native_host.py",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

### Native host registration paths

| OS | Path |
|---|---|
| macOS (user) | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` |
| Linux (user) | `~/.config/google-chrome/NativeMessagingHosts/` |
| Windows | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.myapp.bridge` |

### Updated background.js for Native Messaging

```javascript
let port = null;

function getPort() {
  if (!port) {
    port = chrome.runtime.connectNative("com.myapp.bridge");
    port.onDisconnect.addListener(() => { port = null; });
  }
  return port;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_TASK") {
    const p = getPort();
    p.onMessage.addListener(function handler(response) {
      p.onMessage.removeListener(handler);
      sendResponse(response);
    });
    p.postMessage(message.payload);
    return true;
  }
});
```

---

## Phase 5 — Polish and packaging

### Tasks

- [ ] Stream Claude's response token-by-token using SSE (HTTP mode) or chunked stdout (native mode)
- [ ] Add conversation history — maintain a `messages[]` array, pass full history each call
- [ ] Error states in popup — bridge not running, Claude not installed, timeout
- [ ] Write `install.sh` that auto-detects OS, copies host manifest to correct path, makes script executable
- [ ] Add a settings page to configure port, model, default skill
- [ ] Test on Chrome and Chromium; note that Edge uses a different registry path on Windows

---

## Skills you need

| Skill | Why | Priority |
|---|---|---|
| Python 3.10+ | Bridge server, subprocess calls, stdin/stdout IPC | Essential |
| FastAPI + asyncio | HTTP bridge in Phase 1–3 | Essential |
| Chrome Extension MV3 | Manifest, service worker lifecycle, message passing | Essential |
| JavaScript ES2022 | Background worker, popup, content script | Essential |
| Chrome Native Messaging | Phase 4 upgrade — OS registration, binary framing | Phase 4 |
| subprocess / IPC | Invoking Claude Code CLI from Python | Essential |
| Claude Code CLI | `claude -p`, `--output-format`, context window limits | Essential |
| MCP protocol | Optional — expose bridge as MCP server instead of subprocess | Optional |

---

## Common gotchas

**Service worker sleeps** — Chrome MV3 service workers terminate after ~30 seconds of inactivity. Don't store state in module-level variables; use `chrome.storage.session` for anything you need to survive across messages.

**Native Messaging path must be absolute** — The `"path"` in the host manifest must be an absolute path to the Python interpreter or script. Using `python3 /path/to/native_host.py` is safer than relying on PATH.

**Claude Code must be in PATH** — When Chrome spawns the native host, it uses a minimal environment. Hardcode the full path to `claude` if `subprocess.run(["claude", ...])` fails: e.g. `/usr/local/bin/claude`.

**Extension ID changes** when you reload an unpacked extension. Update `allowed_origins` in the host manifest accordingly. It stabilises once you publish or use a fixed key in the manifest.

**CORS preflight** — FastAPI's `CORSMiddleware` handles OPTIONS preflight automatically, but make sure `allow_headers=["Content-Type"]` is included or `fetch()` will fail silently.

---

## Quick start commands

```bash
# 1. Start the HTTP bridge (Phase 1–3)
cd bridge
pip install fastapi uvicorn
uvicorn server:app --port 8765 --reload

# 2. Test the bridge directly
curl -X POST http://localhost:8765/task \
  -H "Content-Type: application/json" \
  -d '{"prompt": "say hello in one sentence", "context": {}}'

# 3. Load extension in Chrome
# Open chrome://extensions → enable Developer mode → Load unpacked → select extension/

# 4. Register native host (macOS, Phase 4)
cp host-manifest/com.myapp.bridge.json \
  ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

---

## Next steps for Claude Code

When you feed this file to Claude Code, you can ask it to:

- `implement Phase 1 completely` — generate all bridge/server.py code
- `implement Phase 2 completely` — generate all extension files
- `scaffold the full project structure` — create every file with stubs
- `write the install.sh script` — auto-register native host on macOS/Linux
- `add streaming support to the bridge` — SSE token-by-token responses
- `write tests for the bridge` — pytest for context assembler and skill router
