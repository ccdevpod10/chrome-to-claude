const submitBtn = document.getElementById("submit");
const promptEl = document.getElementById("prompt");
const threadEl = document.getElementById("thread");
const emptyState = document.getElementById("empty-state");
const useStreamEl = document.getElementById("use-stream");
const clearHistoryBtn = document.getElementById("clear-history");
const openOptionsEl = document.getElementById("open-options");
const editorContentEl = document.getElementById("editor-content");
const refreshEditorBtn = document.getElementById("refresh-editor");

// ─── Restore conversation thread from session storage on open ─────────────

(async () => {
  const { history = [] } = await chrome.storage.session.get("history");
  for (let i = 0; i < history.length; i += 2) {
    const user = history[i];
    const assistant = history[i + 1];
    if (user) appendMessage("user", user.content);
    if (assistant) appendMessage("assistant", assistant.content);
  }
  if (history.length) hideEmptyState();
})();

// ─── Editor content — auto-fetch on open, manual refresh ─────────────────

async function fetchEditorContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_EDITOR_CONTENT" });
    const text = res?.editor_content?.trim() || "";
    editorContentEl.value = text;
    editorContentEl.classList.toggle("has-content", text.length > 0);
  } catch {
    // Tab has no content script (chrome:// pages, etc.) — leave empty
  }
}

fetchEditorContent();

refreshEditorBtn.addEventListener("click", fetchEditorContent);

// ─── Settings link ────────────────────────────────────────────────────────

openOptionsEl.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ─── Clear history ────────────────────────────────────────────────────────

clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.session.set({ history: [] });
  threadEl.innerHTML = "";
  threadEl.appendChild(emptyState);
  showEmptyState();
});

// ─── Submit ───────────────────────────────────────────────────────────────

submitBtn.addEventListener("click", async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  promptEl.value = "";
  hideEmptyState();
  appendMessage("user", prompt);

  setLoading(true);
  const pendingEl = appendMessage("assistant", "Running…", "loading");

  // Get page context from content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let context = {};
  try {
    context = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTEXT" });
  } catch {
    // Tab may not have a content script (e.g. chrome:// pages)
  }

  // Attach editor content if present
  const editorContent = editorContentEl.value.trim();
  if (editorContent) context.editor_content = editorContent;

  const useStream = useStreamEl.checked;
  const { model = "" } = await chrome.storage.local.get("model");

  if (useStream) {
    await runTaskStreaming(prompt, context, model, pendingEl);
  } else {
    const result = await chrome.runtime.sendMessage({
      type: "RUN_TASK",
      payload: { prompt, context, model },
    });
    setLoading(false);
    updateMessage(pendingEl, result.result || result.error, !!result.error);
  }
});

// ─── Streaming via direct fetch ───────────────────────────────────────────

async function runTaskStreaming(prompt, context, model = "", msgEl) {
  const { bridgePort = 8765 } = await chrome.storage.local.get("bridgePort");
  const url = `http://localhost:${bridgePort}/task/stream`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context, model }),
    });

    if (!res.ok || !res.body) {
      // Bridge returned an error — fall back to background (native messaging / non-stream)
      const result = await chrome.runtime.sendMessage({
        type: "RUN_TASK",
        payload: { prompt, context, model },
      });
      setLoading(false);
      updateMessage(msgEl, result.result || result.error, !!result.error);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    msgEl.className = "msg-body";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          const obj = JSON.parse(raw);
          if (obj.token) { text += obj.token; msgEl.textContent = text; }
          if (obj.result) { msgEl.textContent = obj.result; }
          if (obj.error) { updateMessage(msgEl, obj.error, true); }
        } catch { /* ignore malformed lines */ }
      }

      threadEl.scrollTop = threadEl.scrollHeight;
    }
  } catch {
    // Bridge not reachable — fall back to background (native messaging / non-stream)
    const result = await chrome.runtime.sendMessage({
      type: "RUN_TASK",
      payload: { prompt, context, model },
    });
    updateMessage(msgEl, result.result || result.error, !!result.error);
  } finally {
    setLoading(false);
    threadEl.scrollTop = threadEl.scrollHeight;
  }
}

// ─── Thread helpers ───────────────────────────────────────────────────────

function appendMessage(role, text, extraClass = "") {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : "Claude";

  const body = document.createElement("div");
  body.className = `msg-body${extraClass ? " " + extraClass : ""}`;
  body.textContent = text;

  wrap.appendChild(label);
  wrap.appendChild(body);
  threadEl.appendChild(wrap);
  threadEl.scrollTop = threadEl.scrollHeight;
  return body; // return body so callers can update it (streaming / pending)
}

function updateMessage(bodyEl, text, isError = false) {
  bodyEl.className = isError ? "msg-body error" : "msg-body";
  bodyEl.textContent = text || "";
}

function hideEmptyState() {
  emptyState.style.display = "none";
}

function showEmptyState() {
  emptyState.style.display = "";
}

function setLoading(on) {
  submitBtn.disabled = on;
}

// ─── Ctrl+Enter / Cmd+Enter to send ──────────────────────────────────────

promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    submitBtn.click();
  }
});
