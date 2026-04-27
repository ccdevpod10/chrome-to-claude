import { detect, DetectedSelection } from "./selection-detector";
import { createTooltip } from "./tooltip";
import { createResultPopup } from "./result-popup";
import { createSettingsModal } from "./settings-modal";
import { getShell } from "./ui-shell";
import type { Action, AssistRequest, ReplaceRequest, SWMessage, TriggerTooltip } from "../core/messages";

getShell();
const tooltip = createTooltip();
const popup = createResultPopup({
  onReplace: (text) => {
    if (active) Promise.resolve(active.adapter.replaceSelection(active.info, text));
  },
  onRetry: () => { if (active) runAction("improve"); },
  onStop: (id) => chrome.runtime.sendMessage({ type: "ASSIST_CANCEL", id }).catch(() => {}),
  onClose: () => { active = null; },
  onSettings: () => settings.open(),
});
const settings = createSettingsModal();

let active: DetectedSelection | null = null;
let lastAnchorRect: DOMRect | null = null;
let debounceId = 0;
let inflight = 0;

// Open a long-lived port for receiving SW broadcasts.
let panelPort: chrome.runtime.Port | null = null;
function ensurePanelPort() {
  if (panelPort) return;
  panelPort = chrome.runtime.connect({ name: "panel" });
  panelPort.onMessage.addListener((m: SWMessage) => popup.ingest(m));
  panelPort.onDisconnect.addListener(() => { panelPort = null; });
}
ensurePanelPort();

async function refresh() {
  if (popup.isOpen()) return; // don't pop tooltip while result is showing
  const seq = ++inflight;
  const ctx = await detect();
  if (seq !== inflight) return;
  if (!ctx) {
    tooltip.hide();
    active = null;
    return;
  }
  active = ctx;
  lastAnchorRect = ctx.info.rect;
  tooltip.show(ctx.info.rect, runAction, () => settings.open());
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

chrome.runtime.onMessage.addListener((msg: TriggerTooltip | ReplaceRequest) => {
  if (msg.type === "TRIGGER_TOOLTIP") {
    refresh().then(() => { if (active) runAction("improve"); });
  } else if (msg.type === "REPLACE_SELECTION") {
    if (active) Promise.resolve(active.adapter.replaceSelection(active.info, msg.text));
  }
});

function runAction(action: Action) {
  if (!active) return;
  ensurePanelPort();
  const id = crypto.randomUUID();
  popup.start(id, action, active.info.text);
  popup.showAt(lastAnchorRect ?? active.info.rect);
  tooltip.hide();

  const port = chrome.runtime.connect({ name: "assist" });
  const req: AssistRequest = {
    type: "ASSIST_REQUEST",
    id,
    action,
    code: active.info.text,
    language: active.info.language,
    url: location.href,
  };
  port.postMessage(req);
  setTimeout(() => { try { port.disconnect(); } catch { /* noop */ } }, 5 * 60 * 1000);
}
