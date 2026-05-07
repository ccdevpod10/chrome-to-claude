import { getProvider, listProviders } from "../providers/registry";
import { buildPrompt } from "../core/prompt-builder";
import { getSettings, type Settings } from "../utils/storage";
import { withRetry } from "../utils/retry";
import { log } from "../utils/logger";
import type { AssistRequest, SWMessage } from "../core/messages";

const inflight = new Map<string, AbortController>();
const panelPorts = new Set<chrome.runtime.Port>();
// Replay buffer keyed by request id so a late-connecting panel sees the full session.
const sessions = new Map<string, SWMessage[]>();
const SESSION_TTL = 30 * 60 * 1000;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "ASSIST_CANCEL" && typeof msg.id === "string") {
    const ac = inflight.get(msg.id);
    if (ac) ac.abort();
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "panel") {
    panelPorts.add(port);
    // Replay every buffered session (usually just the latest).
    for (const msgs of sessions.values()) {
      for (const m of msgs) { try { port.postMessage(m); } catch { /* noop */ } }
    }
    port.onDisconnect.addListener(() => panelPorts.delete(port));
    return;
  }
  if (port.name !== "assist") return;

  port.onMessage.addListener(async (msg: AssistRequest) => {
    if (msg?.type !== "ASSIST_REQUEST") return;
    const ac = new AbortController();
    inflight.set(msg.id, ac);

    try {
      const tabId = port.sender?.tab?.id ?? msg.tabId;
      // No auto-open of side panel: the in-page popup (content script) listens on
      // the "panel" port and is already connected before this request fires.
      broadcast({ type: "ASSIST_START", id: msg.id, original: msg.code, action: msg.action, tabId: tabId ?? -1 });

      const settings = await getSettings();
      const provider = pickUsableProvider(settings) ?? getProvider(settings.providerId);
      if (!provider) throw new Error("No provider selected. Open Options.");

      const cfg = {
        apiKey: settings.apiKeys[provider.id] ?? "",
        model: settings.models[provider.id] ?? "",
        baseUrl: settings.baseUrls?.[provider.id],
      };
      if (provider.id !== "local" && !cfg.apiKey) {
        throw new Error(`Missing API key for ${provider.label}. Open Settings to configure.`);
      }

      const { system, user } = buildPrompt(msg.action, msg.code, msg.language, msg.contextBefore, msg.contextAfter, msg.diagnostics);

      let watchdog: number | undefined;
      const bumpWatchdog = () => {
        if (watchdog !== undefined) clearTimeout(watchdog);
        watchdog = setTimeout(() => ac.abort(new DOMException("No data for 45s", "TimeoutError")), 45_000) as unknown as number;
      };
      bumpWatchdog();

      const full = await withRetry(
        () =>
          provider.generate(
            {
              system,
              user,
              signal: ac.signal,
              onChunk: (delta) => {
                bumpWatchdog();
                broadcast({ type: "ASSIST_CHUNK", id: msg.id, delta });
              },
            },
            cfg,
          ),
        { retries: 2 },
      ).finally(() => { if (watchdog !== undefined) clearTimeout(watchdog); });

      broadcast({ type: "ASSIST_DONE", id: msg.id, full });
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      // User-initiated abort: don't fall back, don't surface as error.
      if (e?.name === "AbortError") {
        broadcast({ type: "ASSIST_ERROR", id: msg.id, error: "Cancelled" });
        return;
      }
      const failed = e?.name === "TimeoutError"
        ? "Stream timed out (no data for 45s). Click Retry."
        : (e?.message ?? "Unknown error");
      // Failover
      const settings = await getSettings();
      if (settings.fallbackProviderId && settings.fallbackProviderId !== settings.providerId) {
        const fb = getProvider(settings.fallbackProviderId);
        if (fb) {
          try {
            const cfg = {
              apiKey: settings.apiKeys[fb.id] ?? "",
              model: settings.models[fb.id] ?? "",
              baseUrl: settings.baseUrls?.[fb.id],
            };
            const { system, user } = buildPrompt(msg.action, msg.code, msg.language, msg.contextBefore, msg.contextAfter, msg.diagnostics);
            const full = await fb.generate(
              {
                system, user, signal: ac.signal,
                onChunk: (delta) => broadcast({ type: "ASSIST_CHUNK", id: msg.id, delta }),
              },
              cfg,
            );
            broadcast({ type: "ASSIST_DONE", id: msg.id, full });
            return;
          } catch (e2: unknown) {
            log.error("fallback failed", e2);
          }
        }
      }
      broadcast({ type: "ASSIST_ERROR", id: msg.id, error: failed });
    } finally {
      inflight.delete(msg.id);
    }
  });

  port.onDisconnect.addListener(() => {
    for (const ac of inflight.values()) ac.abort();
    inflight.clear();
  });
});

function pickUsableProvider(s: Settings) {
  const primary = getProvider(s.providerId);
  const hasKey = (id: string) => id === "local" || !!s.apiKeys[id];
  if (primary && hasKey(primary.id)) return primary;
  // Pick the first provider with a key — preserves user intent without surprise switches when primary is configured.
  for (const p of listProviders()) {
    if (hasKey(p.id)) return p;
  }
  return primary;
}

function broadcast(m: SWMessage) {
  // Buffer for replay
  const id = (m as { id?: string }).id;
  if (id) {
    const bucket = sessions.get(id) ?? [];
    bucket.push(m);
    sessions.set(id, bucket);
    // Trim old sessions
    if (sessions.size > 8) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    if (m.type === "ASSIST_DONE" || m.type === "ASSIST_ERROR") {
      setTimeout(() => sessions.delete(id), SESSION_TTL);
    }
  }
  for (const p of panelPorts) {
    try { p.postMessage(m); } catch { /* port closed */ }
  }
}

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "trigger-assist") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    try { await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_TOOLTIP" }); } catch (e) { log.warn(e); }
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    try { await chrome.runtime.openOptionsPage(); } catch (e) { log.warn(e); }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (e) { log.warn(e); }
  }
});
