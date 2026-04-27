# AI Code Assistant — Setup

Provider-agnostic Chrome MV3 extension. No Python bridge.

## Install dependencies

```bash
npm install
```

## Dev (HMR)

```bash
npm run dev
```

`@crxjs/vite-plugin` writes the unpacked extension to `dist/` and watches for changes.
Load it in Chrome:

1. `chrome://extensions` → enable Developer mode
2. Load unpacked → select `dist/`

## Production build

```bash
npm run build
```

Distribute the `dist/` folder (zip + upload to Web Store, or load unpacked).

## Configure providers

Open the extension Options page and set:

- Primary provider (OpenAI / Anthropic / Local)
- API key per provider
- Model id (defaults: `gpt-4o-mini`, `claude-sonnet-4-6`)
- Optional fallback provider for failover

Local provider expects an OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc).
Default base URL: `http://localhost:11434/v1`.

## Use

1. Select code in any web editor (textarea, Monaco, CodeMirror).
2. Tooltip appears with **Fix · Improve · Audit · Debug**.
3. Click an action — side panel opens with streaming diff.
4. **Replace** to write back into the editor, **Copy** to clipboard, **Retry** to rerun.

Keyboard shortcut: `Cmd/Ctrl + Shift + A` runs **Improve** on the active selection.

## Migration from old repo

Old artifacts to delete after verification:

```
bridge/
host-manifest/
extension/             # old vanilla-JS extension
install.sh install.ps1
generate_icons.py
chrome-extension-claude-code-plan.md
```

Move `extension/icons/` → `public/icons/` before deleting.

## Architecture

```
content (Shadow-DOM tooltip) ──port──▶ service worker ──fetch──▶ provider API
                                            │
                                            └──port──▶ side panel (React + diff)
```

- Keys live only in `chrome.storage.local`, read inside the service worker.
- All network requests originate from the SW; content scripts never see API keys.
- Cancellation: panel/content disconnect → SW aborts the in-flight `fetch`.
- Streaming: SSE for OpenAI / OpenAI-compat; Anthropic event stream parsed natively.
- Failover: on retriable error or final failure, the fallback provider is invoked once.
