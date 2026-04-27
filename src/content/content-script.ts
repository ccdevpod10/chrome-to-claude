import { detect, DetectedSelection } from "./selection-detector";
import { createTooltip } from "./tooltip";
import type { Action, AssistRequest, ReplaceRequest, TriggerTooltip } from "../core/messages";

const tooltip = createTooltip();
let active: DetectedSelection | null = null;
let debounceId = 0;
let inflight = 0;

async function refresh() {
  const seq = ++inflight;
  const ctx = await detect();
  if (seq !== inflight) return; // stale
  if (!ctx) {
    tooltip.hide();
    active = null;
    return;
  }
  active = ctx;
  tooltip.show(ctx.info.rect, runAction);
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
  const id = crypto.randomUUID();
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
  tooltip.hide();
}
