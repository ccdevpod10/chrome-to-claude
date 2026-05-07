# Web IDE Helper — Design Specification

**Date:** 2026-05-07  
**Status:** Implemented (Phase 8 complete)

---

## Overview

Web IDE Helper is a Chrome MV3 extension that brings multi-provider LLM assistance directly into any web-based IDE. It works across Monaco (VS Code Online, StackBlitz, CodeSandbox), CodeMirror 5/6, and plain `<textarea>` editors. Developers can review, generate, and debug code without leaving the browser tab.

---

## Architecture

```
User interaction (tooltip / palette / right-click / side panel)
  └─ content-script.ts  ──── main-world bridge (monaco/cm reads)
       └─ chrome.runtime.Port ("assist")
            └─ service-worker.ts (background)
                 ├─ prompt-builder.ts  →  provider.generate()
                 ├─ conversation-store.ts (session history)
                 └─ chrome.runtime.Port ("panel")  →  side panel UI (React)
```

All IPC is via `chrome.runtime` ports and messages (no HTTP, no CORS). The service worker is the single point of LLM access; content scripts never hold API keys.

---

## Editor Support

| Adapter | Detection | Read strategy | Write strategy |
|---|---|---|---|
| Monaco | `window.monaco` exists | main-world bridge (`bridge.ts`) via `ISOLATED_TO_MAIN` message | `editor.executeEdits()` via bridge |
| CM6 | `.cm-editor` DOM + CodeMirror6 view | `EditorView.state.doc.toString()` | `view.dispatch(transaction)` |
| CM5 | `.CodeMirror` DOM | `cm.getValue()` | `cm.replaceSelection()` |
| textarea | `<textarea>` fallback | `element.value` slice | `document.execCommand('insertText')` |

The `main-world.ts` script is injected with `world: "MAIN"` to reach Monaco's global namespace. Results are relayed back to the isolated content script via `window.postMessage`.

---

## Action System

**Review** (text responses): `review`, `explain`, `find-bugs`  
**Generate** (code responses): `generate`, `write-tests`, `write-docs`, `scaffold`  
**Debug** (code responses): `debug-error`, `trace`, `fix`, `debug` (legacy)  
**Legacy**: `improve`, `audit`

Actions are routed through `buildPrompt()` which selects the system prompt and user-message template. Code-producing actions use `SYSTEM_CODE`; analysis actions use `SYSTEM_TEXT`.

---

## Context System

**File context**: Up to 60 lines before and 60 lines after the current selection are captured by editor adapters and sent as `FileContext`. Token budget enforcement trims symmetrically from outer edges if combined context exceeds 3000 tokens (~12,000 chars). The selection itself is always preserved in full.

**Conversation history**: Last 6 turns per tab, stored in `chrome.storage.session` (ephemeral — cleared on browser restart). The store is tab-scoped using `tabId` as the key prefix. History is appended after each successful request and passed to `buildPrompt()` for multi-turn continuity.

---

## UI Surfaces

| Surface | Trigger | Purpose |
|---|---|---|
| Side panel | Extension icon click / `OPEN_SIDE_PANEL` message | Primary chat interface — full conversation thread, markdown rendering, diff view |
| Tooltip | Text selection detected (300ms debounce) | Quick 3-button overlay: Review / Fix / Debug |
| Command palette | `⌘K` (or `Ctrl+K`) | Free-text generation — no selection required |
| Right-click menu | Context menu on selection | Review / Debug / Explain via `chrome.contextMenus` |

---

## Provider System

Providers implement a common `generate(req, cfg)` → `Promise<string>` interface with streaming via `onChunk` callbacks.

| Provider | ID | Notes |
|---|---|---|
| OpenRouter | `openrouter` | Default; routes to many models |
| Anthropic | `anthropic` | Direct API; supports claude-sonnet-4-6 |
| OpenAI | `openai` | Direct API; gpt-4o-mini default |
| Local (Ollama) | `local` | OpenAI-compatible at `localhost:11434` |

A fallback provider can be configured; the service worker automatically retries with it on primary failure.

---

## Production Hardening

**Token budget**: `applyTokenBudget()` in `prompt-builder.ts` trims `FileContext.linesBefore` and `linesAfter` symmetrically (outer lines first) until combined size is under 12,000 chars (~3000 tokens). Applied before every prompt build.

**Rate limiting**: `isRateLimited(tabId)` in `service-worker.ts` enforces a 10 requests/minute per-tab cap using a sliding window timestamp log. Excess requests receive an `ASSIST_ERROR` immediately without consuming API quota.

**Write serialization**: Storage writes use fire-and-void (`void appendMessage(...)`) to avoid blocking the streaming response. The conversation store serializes appends per tab via promise chaining to prevent interleaving.

**Watchdog timer**: A 45-second inactivity timeout aborts stalled streams. The timer resets on each received chunk (`bumpWatchdog`).

**Retry**: `withRetry()` retries provider calls up to 2 times with exponential backoff before triggering fallback.
