const submitBtn = document.getElementById("submit");
const promptEl = document.getElementById("prompt");
const threadEl = document.getElementById("thread");
const emptyState = document.getElementById("empty-state");
const useStreamEl = document.getElementById("use-stream");
const clearHistoryBtn = document.getElementById("clear-history");
const openOptionsEl = document.getElementById("open-options");

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
  if (role === "assistant" && !extraClass) {
    renderMessageContent(body, text, true);
  } else {
    body.textContent = text;
  }

  wrap.appendChild(label);
  wrap.appendChild(body);
  threadEl.appendChild(wrap);
  threadEl.scrollTop = threadEl.scrollHeight;
  return body; // return body so callers can update it (streaming / pending)
}

function updateMessage(bodyEl, text, isError = false) {
  bodyEl.className = isError ? "msg-body error" : "msg-body";
  renderMessageContent(bodyEl, text || "", !isError);
}

// ─── Code block parsing + Replace in editor ──────────────────────────────

/**
 * Render response text, detecting ```fenced code blocks``` and adding
 * "Replace in editor" buttons to each one.
 */
function renderMessageContent(bodyEl, text, isAssistant) {
  bodyEl.innerHTML = "";

  if (!isAssistant || !text.includes("```")) {
    bodyEl.textContent = text;
    return;
  }

  // Split on fenced code blocks:  ```lang\ncode\n```
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith("```") && part.endsWith("```")) {
      // Extract optional language hint and code body
      const inner = part.slice(3, -3);
      const newline = inner.indexOf("\n");
      const lang = newline > 0 ? inner.slice(0, newline).trim() : "";
      const code = newline > 0 ? inner.slice(newline + 1) : inner;

      const block = document.createElement("div");
      block.className = "code-block";

      if (lang) {
        const langTag = document.createElement("span");
        langTag.className = "code-block-lang";
        langTag.textContent = lang;
        block.appendChild(langTag);
      }

      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      block.appendChild(pre);

      // Action buttons
      const actions = document.createElement("div");
      actions.className = "code-block-actions";

      const replaceBtn = document.createElement("button");
      replaceBtn.className = "btn-replace";
      replaceBtn.textContent = "↻ Replace in editor";
      replaceBtn.addEventListener("click", () => handleReplace(replaceBtn, code));
      actions.appendChild(replaceBtn);

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(code);
        copyBtn.textContent = "Copied";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
      });
      actions.appendChild(copyBtn);

      block.appendChild(actions);
      bodyEl.appendChild(block);
    } else if (part.trim()) {
      const span = document.createElement("span");
      span.textContent = part;
      bodyEl.appendChild(span);
    }
  }
}

/**
 * Replace the current editor selection on the active tab with `newCode`.
 * Routes through background.js which uses executeScript(MAIN world).
 * Shows an Undo button for 5 seconds.
 */
async function handleReplace(btn, newCode) {
  btn.textContent = "…";

  const res = await chrome.runtime.sendMessage({ type: "REPLACE_CODE", code: newCode });

  if (!res?.ok) {
    btn.textContent = "Failed";
    setTimeout(() => { btn.textContent = "↻ Replace in editor"; btn.className = "btn-replace"; }, 2000);
    return;
  }

  btn.textContent = "✓ Replaced";
  btn.className = "btn-done";
}

// ─── UI helpers ──────────────────────────────────────────────────────────

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
