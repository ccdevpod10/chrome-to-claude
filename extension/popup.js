const submitBtn = document.getElementById("submit");
const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const useStreamEl = document.getElementById("use-stream");
const clearHistoryBtn = document.getElementById("clear-history");
const openOptionsEl = document.getElementById("open-options");

// ─── Settings link ────────────────────────────────────────────────────────

openOptionsEl.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ─── Clear history ────────────────────────────────────────────────────────

clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.session.set({ history: [] });
  setResult("History cleared.", false);
});

// ─── Submit ───────────────────────────────────────────────────────────────

submitBtn.addEventListener("click", async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  setLoading(true);

  // Get page context from content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let context = {};
  try {
    context = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTEXT" });
  } catch {
    // Tab may not have a content script (e.g. chrome:// pages)
  }

  const useStream = useStreamEl.checked;
  const { model = "", activeProvider = "claude-cli" } = await chrome.storage.local.get([
    "model",
    "activeProvider",
  ]);

  // Streaming only works through the Claude CLI bridge endpoint.
  if (useStream && activeProvider === "claude-cli") {
    await runTaskStreaming(prompt, context, model);
  } else {
    const result = await chrome.runtime.sendMessage({
      type: "RUN_TASK",
      payload: { prompt, context, model },
    });
    setLoading(false);
    setResult(result.result || result.error, !!result.error);
  }
});

// ─── Streaming via direct fetch (bypasses background for HTTP mode) ───────

async function runTaskStreaming(prompt, context, model = "") {
  const { bridgePort = 8765 } = await chrome.storage.local.get("bridgePort");
  const url = `http://localhost:${bridgePort}/task/stream`;

  resultEl.className = "loading";
  resultEl.textContent = "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context, model }),
    });

    if (!res.ok || !res.body) {
      // Fall back to non-streaming
      const data = await res.json().catch(() => ({ error: "Stream unavailable" }));
      setLoading(false);
      setResult(data.result || data.error, !!data.error);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    resultEl.className = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          const obj = JSON.parse(raw);
          if (obj.token) resultEl.textContent += obj.token;
          if (obj.result) resultEl.textContent = obj.result;
          if (obj.error) { resultEl.className = "error"; resultEl.textContent = obj.error; }
        } catch { /* ignore malformed lines */ }
      }

      resultEl.scrollTop = resultEl.scrollHeight;
    }
  } catch (err) {
    setResult(err.message, true);
  } finally {
    setLoading(false);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function setLoading(on) {
  submitBtn.disabled = on;
  if (on) {
    resultEl.className = "loading";
    resultEl.textContent = "Running…";
  }
}

function setResult(text, isError = false) {
  resultEl.className = isError ? "error" : "";
  resultEl.textContent = text || "";
}

// Allow Ctrl+Enter / Cmd+Enter to submit
promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    submitBtn.click();
  }
});
