// Set USE_NATIVE = true after running install.sh and configuring the native host.
const USE_NATIVE = true;

// ─── Side panel — open on toolbar icon click ──────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Also set on service worker startup (covers reload without reinstall)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── HTTP bridge (Phases 1–3, and dev fallback) ───────────────────────────

async function getBridgeUrl() {
  const { bridgePort = 8765 } = await chrome.storage.local.get("bridgePort");
  return `http://localhost:${bridgePort}`;
}

async function checkBridge(bridgeUrl) {
  try {
    const res = await fetch(`${bridgeUrl}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function handleTaskHttp(payload) {
  const bridgeUrl = await getBridgeUrl();
  const alive = await checkBridge(bridgeUrl);
  if (!alive) {
    return {
      error: `Bridge not running. Start it with: cd bridge && uvicorn server:app --port 8765`,
    };
  }
  try {
    const res = await fetch(`${bridgeUrl}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Native Messaging (Phase 4) ───────────────────────────────────────────

let nativePort = null;

function getNativePort() {
  if (!nativePort) {
    nativePort = chrome.runtime.connectNative("com.myapp.bridge");
    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
    });
  }
  return nativePort;
}

function handleTaskNative(payload) {
  return new Promise((resolve) => {
    try {
      const port = getNativePort();
      const handler = (response) => {
        port.onMessage.removeListener(handler);
        resolve(response);
      };
      port.onMessage.addListener(handler);
      port.postMessage(payload);
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

// ─── Message router ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_TASK") {
    handleTask(message.payload).then(sendResponse);
    return true;
  }

  // Inline tooltip: user clicked an action (Improve, Audit, Fix, Explain)
  if (message.type === "CODE_ACTION") {
    handleCodeAction(message, sender).then(sendResponse);
    return true;
  }

  // Inline tooltip: user clicked Replace on a code block
  if (message.type === "REPLACE_CODE") {
    handleReplaceCode(message, sender).then(sendResponse);
    return true;
  }

  // Inline tooltip: content.js needs MAIN-world selection read
  if (message.type === "READ_SELECTION") {
    handleReadSelection(sender).then(sendResponse);
    return true;
  }
});

// ─── Inline tooltip: CODE_ACTION ──────────────────────────────────────────

async function handleCodeAction(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { error: "No tab" };

  // Read the full selection from the MAIN world (handles Monaco, CodeMirror, etc.)
  let fullCode = message.code || "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: readSelection,
    });
    for (const r of results || []) {
      const text = r?.result;
      if (text && text.length > fullCode.length) { fullCode = text; break; }
    }
  } catch { /* use what content.js sent */ }

  // Build prompt with the action
  const action = message.action || "Improve";
  const prompt = `${action} this code`;
  const context = {
    url: message.url || "",
    title: message.title || "",
    editor_content: fullCode,
  };

  const response = await handleTask({ prompt, context });

  // Forward result only to the frame that triggered the action (sender.frameId).
  // Without frameId, Chrome broadcasts to every frame → duplicate panels in multi-frame IDEs.
  try {
    await chrome.tabs.sendMessage(
      tabId,
      { type: "CODE_ACTION_RESULT", action, result: response.result || "", error: response.error || "" },
      { frameId: sender.frameId ?? 0 }
    );
  } catch { /* tab may have closed */ }

  return response;
}

// ─── Inline tooltip: READ_SELECTION (MAIN world) ──────────────────────────

async function handleReadSelection(sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { text: "" };

  try {
    // Try the specific frame first (sender.frameId), then all frames
    const frameId = sender.frameId;
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: readSelection,
    });
    // Return the first non-empty result from any frame
    for (const r of results || []) {
      const text = r?.result;
      if (text && text.trim().length > 0) return { text };
    }
    return { text: "" };
  } catch {
    return { text: "" };
  }
}

// ─── Inline tooltip: REPLACE_CODE ─────────────────────────────────────────

async function handleReplaceCode(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { ok: false };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: writeSelection,
      args: [message.code],
    });
    // Any frame that returned true means success
    for (const r of results || []) {
      if (r?.result === true) return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// ─── Editor read/write (serialised, injected into page MAIN world) ────────

function readSelection() {
  try {
    if (window.monaco?.editor) {
      for (const e of window.monaco.editor.getEditors()) {
        const s = e.getSelection();
        if (s && !s.isEmpty()) return e.getModel()?.getValueInRange(s) || "";
      }
    }
  } catch {}
  try {
    for (const el of document.querySelectorAll(".cm-editor")) {
      if (el?.cmView?.view) {
        const v = el.cmView.view;
        const { from, to } = v.state.selection.main;
        if (from !== to) return v.state.sliceDoc(from, to);
      }
    }
  } catch {}
  try {
    for (const el of document.querySelectorAll(".CodeMirror")) {
      if (el?.CodeMirror) { const t = el.CodeMirror.getSelection(); if (t) return t; }
    }
  } catch {}
  try {
    for (const el of document.querySelectorAll(".ace_editor")) {
      if (el?.env?.editor) { const t = el.env.editor.getSelectedText(); if (t) return t; }
    }
  } catch {}
  try {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type === "text")))
      if (el.selectionStart !== el.selectionEnd) return el.value.substring(el.selectionStart, el.selectionEnd);
  } catch {}
  return window.getSelection()?.toString() || "";
}

function writeSelection(text) {
  try {
    if (window.monaco?.editor) {
      for (const e of window.monaco.editor.getEditors()) {
        const s = e.getSelection();
        if (s && !s.isEmpty()) {
          e.executeEdits("claude-bridge", [{ range: s, text, forceMoveMarkers: true }]);
          return true;
        }
      }
    }
  } catch {}
  try {
    for (const el of document.querySelectorAll(".cm-editor")) {
      if (el?.cmView?.view) {
        const v = el.cmView.view;
        const { from, to } = v.state.selection.main;
        if (from !== to) { v.dispatch({ changes: { from, to, insert: text } }); return true; }
      }
    }
  } catch {}
  try {
    for (const el of document.querySelectorAll(".CodeMirror")) {
      if (el?.CodeMirror && el.CodeMirror.getSelection()) { el.CodeMirror.replaceSelection(text); return true; }
    }
  } catch {}
  try {
    for (const el of document.querySelectorAll(".ace_editor")) {
      if (el?.env?.editor && el.env.editor.getSelectedText()) {
        el.env.editor.session.replace(el.env.editor.getSelectionRange(), text);
        return true;
      }
    }
  } catch {}
  try {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type === "text"))) {
      if (el.selectionStart !== el.selectionEnd) {
        el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    }
  } catch {}
  try {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) { document.execCommand("insertText", false, text); return true; }
  } catch {}
  return false;
}

async function handleTask(payload) {
  const { history = [] } = await chrome.storage.session.get("history");
  const {
    activeProvider = "claude-cli",
    providers = {},
    actionProviders = {},
  } = await chrome.storage.local.get(["activeProvider", "providers", "actionProviders"]);

  // Per-action override (advanced) → global active provider → "claude-cli"
  const provider =
    (payload.action && actionProviders[payload.action]) ||
    activeProvider ||
    "claude-cli";
  const providerConfig = providers[provider] || {};

  const enrichedPayload = { ...payload, history };
  let response;

  if (provider === "claude-cli") {
    const { model: legacyModel = "" } = await chrome.storage.local.get("model");
    enrichedPayload.model = payload.model || providerConfig.model || legacyModel;
    response = USE_NATIVE
      ? await handleTaskNative(enrichedPayload)
      : await handleTaskHttp(enrichedPayload);
  } else {
    response = await callProviderAPI(provider, providerConfig, enrichedPayload);
  }

  if (response.result) {
    const updated = [
      ...history,
      { role: "user", content: payload.prompt },
      { role: "assistant", content: response.result },
    ].slice(-20);
    await chrome.storage.session.set({ history: updated });
  }

  return response;
}

function buildMessages(prompt, context, history) {
  const parts = [];
  if (context?.editor_content)
    parts.push("Code:\n```\n" + context.editor_content + "\n```");
  if (context?.url) parts.push("Page: " + context.url);

  const messages = (history || []).map((m) => ({ role: m.role, content: m.content }));
  const userContent = parts.length
    ? parts.join("\n\n") + "\n\nTask: " + prompt
    : prompt;
  messages.push({ role: "user", content: userContent });
  return messages;
}

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  openrouter: "openai/gpt-4o",
};

async function callProviderAPI(provider, config, payload) {
  const { apiKey, model } = config;
  if (!apiKey)
    return { error: `No API key configured for ${provider}. Open Settings to add one.` };

  const messages = buildMessages(payload.prompt, payload.context, payload.history);
  const resolvedModel = payload.model || model || DEFAULT_MODELS[provider];

  try {
    let result;
    if (provider === "anthropic") result = await callAnthropic(apiKey, resolvedModel, messages);
    else if (provider === "openai") result = await callOpenAI(apiKey, resolvedModel, messages);
    else if (provider === "openrouter") result = await callOpenRouter(apiKey, resolvedModel, messages);
    else return { error: "Unknown provider: " + provider };
    return { result };
  } catch (err) {
    return { error: err.message };
  }
}

async function parseProviderError(label, res) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const msg = json?.error?.message || json?.message || text;
    throw new Error(`${label} ${res.status}: ${msg}`);
  } catch (e) {
    if (e.message.startsWith(label)) throw e;
    throw new Error(`${label} ${res.status}: ${text}`);
  }
}

async function callAnthropic(apiKey, model, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 8192, messages }),
  });
  if (!res.ok) await parseProviderError("Anthropic", res);
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(apiKey, model, messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) await parseProviderError("OpenAI", res);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenRouter(apiKey, model, messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "X-Title": "Claude Code Bridge",
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) await parseProviderError("OpenRouter", res);
  const data = await res.json();
  return data.choices[0].message.content;
}
