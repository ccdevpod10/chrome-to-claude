import { detect, DetectedSelection } from "./selection-detector";
import { createTooltip } from "./tooltip";
import { createSettingsModal } from "./settings-modal";
import { createCommandPalette } from "./command-palette";
import { getShell } from "./ui-shell";
import { dryRunJs, isJsLanguage, looksLikeJs } from "./dry-run";
import type { Action, AssistRequest, Diagnostic, PaletteFire, ReplaceRequest, SWMessage, TriggerTooltip } from "../core/messages";

getShell();
const tooltip = createTooltip();

// ---------------------------------------------------------------------------
// Command palette (⌘K / Ctrl+K)
// ---------------------------------------------------------------------------
const palette = createCommandPalette((req) => {
  ensurePanelPort();
  const id = crypto.randomUUID();

  tooltip.hide();

  // Open the side panel (best-effort — may require user gesture in some Chrome versions).
  chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }).catch(() => {});

  const port = chrome.runtime.connect({ name: "assist" });
  const assistReq: AssistRequest = {
    type: "ASSIST_REQUEST",
    id,
    action: req.action,
    code: req.code ?? "",
    language: req.language,
    freeText: req.freeText,
    url: req.url,
  };
  port.postMessage(assistReq);
  setTimeout(() => { try { port.disconnect(); } catch { /* noop */ } }, 5 * 60 * 1000);
});
const settings = createSettingsModal();

let active: DetectedSelection | null = null;
let debounceId = 0;
let inflight = 0;

// Open a long-lived port for receiving SW broadcasts.
let panelPort: chrome.runtime.Port | null = null;
function ensurePanelPort() {
  if (panelPort) return;
  panelPort = chrome.runtime.connect({ name: "panel" });
  panelPort.onMessage.addListener((_m: SWMessage) => {
    // The React side panel handles its own port; nothing to do here.
  });
  panelPort.onDisconnect.addListener(() => { panelPort = null; });
}
ensurePanelPort();

async function refresh() {
  const seq = ++inflight;
  const ctx = await detect();
  if (seq !== inflight) return;
  if (!ctx) {
    tooltip.hide();
    active = null;
    return;
  }
  active = ctx;
  tooltip.show(ctx.info.rect, runAction, () => palette.open(active), () => settings.open());
}

function scheduleRefresh() {
  window.clearTimeout(debounceId);
  debounceId = window.setTimeout(refresh, 120);
}

document.addEventListener("selectionchange", scheduleRefresh, true);
document.addEventListener("mouseup", scheduleRefresh, true);
document.addEventListener("keyup", (e) => {
  if (e.shiftKey || e.ctrlKey || e.metaKey || e.key === "Escape") scheduleRefresh();
}, true);
document.addEventListener("scroll", () => tooltip.hide(), true);
window.addEventListener("blur", () => tooltip.hide());

// ⌘K / Ctrl+K — open the command palette
document.addEventListener("keydown", async (e) => {
  if (!((e.metaKey || e.ctrlKey) && e.key === "k")) return;
  try {
    if (palette.isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      palette.close();
      return;
    }
    const selection = active ?? await detect();
    e.preventDefault();
    e.stopPropagation();
    palette.open(selection);
  } catch {
    // If palette setup failed, let the event propagate normally
  }
}, true);

chrome.runtime.onMessage.addListener((msg: TriggerTooltip | ReplaceRequest | PaletteFire) => {
  if (msg.type === "TRIGGER_TOOLTIP") {
    refresh().then(() => { if (active) runAction("review"); });
  } else if (msg.type === "REPLACE_SELECTION") {
    if (active) {
      Promise.resolve(active.adapter.replaceSelection(active.info, msg.text))
        .catch((e) => console.warn("[ai-assist] replaceSelection failed", e));
    }
  } else if (msg.type === "PALETTE_FIRE") {
    (async () => {
      const sel = active ?? await detect();
      runAction(msg.action, sel ?? undefined, msg.freeText);
    })();
  }
});

async function runAction(action: Action, selection?: DetectedSelection, freeText?: string) {
  const ctx = selection ?? active;
  if (!ctx) return;
  ensurePanelPort();
  const id = crypto.randomUUID();
  const code = ctx.info.text;
  const language = ctx.info.language;

  tooltip.hide();

  // For "debug" on JS/jQuery, run a sandboxed dry-run first so the LLM
  // gets grounded findings instead of guessing.
  let diagnostics: Diagnostic[] | undefined;
  if (action === "debug" && (isJsLanguage(language) || looksLikeJs(code))) {
    try {
      diagnostics = await dryRunJs(code);
    } catch (e) {
      diagnostics = [{ level: "warn", message: `Dry-run failed: ${(e as Error).message}` }];
    }
  }

  // Open the side panel so results are visible (best-effort).
  chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }).catch(() => {});

  const port = chrome.runtime.connect({ name: "assist" });
  const req: AssistRequest = {
    type: "ASSIST_REQUEST",
    id,
    action,
    code,
    language,
    url: location.href,
    diagnostics,
    freeText,
  };
  port.postMessage(req);
  setTimeout(() => { try { port.disconnect(); } catch { /* noop */ } }, 5 * 60 * 1000);
}
