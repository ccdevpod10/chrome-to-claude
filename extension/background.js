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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RUN_TASK") {
    handleTask(message.payload).then(sendResponse);
    return true; // keep channel open for async response
  }
});

async function handleTask(payload) {
  // Load conversation history and settings
  const { history = [] } = await chrome.storage.session.get("history");
  const { model = "" } = await chrome.storage.local.get("model");
  const enrichedPayload = { ...payload, history, model: payload.model || model };

  const response = USE_NATIVE
    ? await handleTaskNative(enrichedPayload)
    : await handleTaskHttp(enrichedPayload);

  // Persist history (cap at 10 exchanges = 20 messages)
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
