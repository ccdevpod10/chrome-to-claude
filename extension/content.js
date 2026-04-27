// ─── Claude Code Bridge: Inline Tooltip ──────────────────────────────────
// Shows a floating action toolbar when the user selects code on any page.
// Actions are routed through background.js (which uses executeScript in MAIN
// world for editor read/write) and then to the Python bridge → Claude CLI.
//
// All tooltip DOM lives inside a shadow root to avoid style conflicts.

(() => {
  if (window.__cbInjected) return;
  window.__cbInjected = true;

  // ── State ────────────────────────────────────────────────────────────────

  let hostEl = null;       // <div> attached to document.body
  let shadow = null;       // closed shadow root
  let toolbarEl = null;    // action toolbar
  let responseEl = null;   // response popup
  let lastSelectionText = "";
  let lastRect = null;     // DOMRect of last selection
  let pendingRect = null;  // rect captured when action was triggered

  // ── Shadow DOM setup ─────────────────────────────────────────────────────

  function ensureShadow() {
    if (shadow) return;
    hostEl = document.createElement("div");
    hostEl.id = "claude-bridge-host";
    hostEl.style.cssText = "all:initial; position:absolute; z-index:2147483647; pointer-events:none;";
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = TOOLTIP_CSS;
    shadow.appendChild(style);
  }

  // ── Action toolbar ───────────────────────────────────────────────────────

  function showToolbar(rect, text) {
    ensureShadow();
    hideToolbar();
    lastSelectionText = text;
    lastRect = rect;

    toolbarEl = document.createElement("div");
    toolbarEl.className = "cb-toolbar";
    toolbarEl.innerHTML = `
      <span class="cb-logo">✦</span>
      <button data-action="Improve">Improve</button>
      <button data-action="Audit">Audit</button>
      <button data-action="Fix bugs">Fix bugs</button>
      <button data-action="Explain">Explain</button>
    `;

    toolbarEl.addEventListener("click", (e) => {
      const action = e.target.dataset?.action;
      if (!action) return;
      e.stopPropagation();
      onAction(action, text);
    });

    shadow.appendChild(toolbarEl);
    positionElement(toolbarEl, rect, "above");
  }

  function hideToolbar() {
    if (toolbarEl) { toolbarEl.remove(); toolbarEl = null; }
  }

  // ── Response popup ───────────────────────────────────────────────────────

  function showResponse(result, action) {
    ensureShadow();
    hideResponse();

    responseEl = document.createElement("div");
    responseEl.className = "cb-response";

    // Header
    const header = document.createElement("div");
    header.className = "cb-response-header";
    header.innerHTML = `<span>Claude — ${action}</span>`;
    const dismiss = document.createElement("button");
    dismiss.className = "cb-dismiss";
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", hideResponse);
    header.appendChild(dismiss);
    responseEl.appendChild(header);

    // Body — parse code blocks
    const body = document.createElement("div");
    body.className = "cb-response-body";
    renderResponse(body, result);
    responseEl.appendChild(body);

    shadow.appendChild(responseEl);
    const rectToUse = pendingRect || lastRect;
    if (rectToUse) positionElement(responseEl, rectToUse, "below");
    pendingRect = null;
  }

  function showLoading(action) {
    ensureShadow();
    hideResponse();

    responseEl = document.createElement("div");
    responseEl.className = "cb-response cb-loading";
    responseEl.innerHTML = `
      <div class="cb-response-header">
        <span>Claude — ${action}</span>
        <button class="cb-dismiss">✕</button>
      </div>
      <div class="cb-response-body"><span class="cb-spinner"></span> Thinking…</div>
    `;
    responseEl.querySelector(".cb-dismiss").addEventListener("click", hideResponse);

    shadow.appendChild(responseEl);
    const rectToUse = pendingRect || lastRect;
    if (rectToUse) positionElement(responseEl, rectToUse, "below");
  }

  function hideResponse() {
    if (!shadow) return;
    shadow.querySelectorAll('.cb-response').forEach(el => el.remove());
    responseEl = null;
  }

  // ── Render Claude's response with code blocks ────────────────────────────

  function renderResponse(container, text) {
    if (!text.includes("```")) {
      container.textContent = text;
      return;
    }

    const parts = text.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      if (part.startsWith("```") && part.endsWith("```")) {
        const inner = part.slice(3, -3);
        const nl = inner.indexOf("\n");
        const lang = nl > 0 ? inner.slice(0, nl).trim() : "";
        const code = nl > 0 ? inner.slice(nl + 1) : inner;

        const block = document.createElement("div");
        block.className = "cb-code-block";

        if (lang) {
          const tag = document.createElement("span");
          tag.className = "cb-lang";
          tag.textContent = lang;
          block.appendChild(tag);
        }

        const pre = document.createElement("pre");
        pre.textContent = code;
        block.appendChild(pre);

        const actions = document.createElement("div");
        actions.className = "cb-code-actions";

        const replaceBtn = document.createElement("button");
        replaceBtn.className = "cb-btn-replace";
        replaceBtn.textContent = "↻ Replace";
        replaceBtn.addEventListener("click", () => onReplace(replaceBtn, code));
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
        container.appendChild(block);
      } else if (part.trim()) {
        const p = document.createElement("p");
        p.textContent = part;
        container.appendChild(p);
      }
    }
  }

  // ── Positioning ──────────────────────────────────────────────────────────

  function positionElement(el, rect, placement) {
    el.style.pointerEvents = "auto";
    el.style.position = "fixed";
    el.style.left = `${Math.max(8, rect.left)}px`;

    if (placement === "above") {
      el.style.top = `${rect.top - 44}px`;
    } else {
      el.style.top = `${rect.bottom + 8}px`;
    }

    // Clamp to viewport
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) {
        el.style.left = `${window.innerWidth - r.width - 8}px`;
      }
      if (r.bottom > window.innerHeight - 8) {
        el.style.top = `${window.innerHeight - r.height - 8}px`;
      }
      if (r.top < 8) {
        el.style.top = "8px";
      }
    });
  }

  // ── Actions → background.js ──────────────────────────────────────────────

  function onAction(action, code) {
    if (!chrome.runtime?.sendMessage) {
      showResponse("Extension context invalidated. Please reload the page.", action);
      return;
    }
    pendingRect = lastRect;
    hideToolbar();
    showLoading(action);
    chrome.runtime.sendMessage({
      type: "CODE_ACTION",
      action,
      code,
      url: window.location.href,
      title: document.title,
    }).catch(() => {
      showResponse("Failed to reach the bridge. Is it running?", action);
    });
  }

  function onReplace(btn, code) {
    if (!chrome.runtime?.sendMessage) {
      btn.textContent = "✗ Error";
      return;
    }
    btn.textContent = "…";
    chrome.runtime.sendMessage({ type: "REPLACE_CODE", code }).then((res) => {
      if (res?.ok) {
        btn.textContent = "✓ Replaced";
        btn.className = "cb-btn-done";
      } else {
        btn.textContent = "✗ Failed";
        setTimeout(() => { btn.textContent = "↻ Replace"; btn.className = "cb-btn-replace"; }, 2000);
      }
    }).catch(() => {
      btn.textContent = "✗ Error";
    });
  }

  // ── Listen for responses from background ─────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CODE_ACTION_RESULT") {
      const text = message.result || message.error || "No response.";
      showResponse(text, message.action || "Code");
    }
  });

  // ── Selection detection ──────────────────────────────────────────────────
  // Web IDEs (Monaco, CodeMirror, ACE) use internal selection models that
  // don't trigger `selectionchange` and don't appear in `window.getSelection()`.
  // We use mouseup/keyup as triggers and ask background.js to read the real
  // selection from the MAIN world (where editor APIs are accessible).

  let debounce = null;
  let lastMousePos = { x: 0, y: 0 };

  // Track mouse position for toolbar placement
  document.addEventListener("mousemove", (e) => {
    lastMousePos = { x: e.clientX, y: e.clientY };
  }, true);

  function checkSelection(e) {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      // 1. Try native DOM selection first (works for plain textareas, contenteditable)
      const sel = window.getSelection();
      const domText = sel?.toString().trim() || "";

      if (domText.length >= 10) {
        try {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            showToolbar(rect, domText);
            return;
          }
        } catch { /* fall through */ }
      }

      // 2. No DOM selection — ask background.js to read from MAIN world
      //    (handles Monaco, CodeMirror, ACE whose selections are internal)
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "READ_SELECTION" }).then((res) => {
          const text = res?.text?.trim() || "";
          if (text.length >= 10) {
            // Use mouse position to build a synthetic rect for positioning
            const rect = {
              left: lastMousePos.x - 100,
              right: lastMousePos.x + 100,
              top: lastMousePos.y - 20,
              bottom: lastMousePos.y,
              width: 200,
              height: 20,
            };
            showToolbar(rect, text);
          } else {
            hideToolbar();
          }
        }).catch(() => {});
      } else {
        hideToolbar();
      }
    }, 400);
  }

  // Trigger on mouseup (end of mouse selection) and keyup with shift (keyboard selection)
  document.addEventListener("mouseup", checkSelection, true);
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") checkSelection();
  }, true);

  // Hide toolbar when clicking outside
  document.addEventListener("mousedown", (e) => {
    if (hostEl && !hostEl.contains(e.target)) {
      hideToolbar();
      hideResponse();
    }
  });

  // ── Message handlers (sidepanel GET_CONTEXT + background READ_SELECTION_RESULT) ──

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_CONTEXT") {
      sendResponse({
        url: window.location.href,
        title: document.title,
        selected_text: window.getSelection()?.toString() || "",
      });
      return true;
    }
  });

  // ── Tooltip CSS ──────────────────────────────────────────────────────────

  const TOOLTIP_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .cb-toolbar {
      position: fixed;
      display: flex;
      align-items: center;
      gap: 2px;
      background: #1e1e2e;
      border: 1px solid #45475a;
      border-radius: 8px;
      padding: 4px 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      pointer-events: auto;
      z-index: 2147483647;
    }

    .cb-logo {
      color: #89b4fa;
      font-size: 13px;
      padding: 0 4px;
    }

    .cb-toolbar button {
      background: transparent;
      color: #cdd6f4;
      border: none;
      border-radius: 5px;
      padding: 4px 10px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.12s;
    }

    .cb-toolbar button:hover {
      background: #313244;
      color: #fff;
    }

    /* ── Response popup ── */

    .cb-response {
      position: fixed;
      width: 420px;
      max-height: 360px;
      background: #1e1e2e;
      border: 1px solid #45475a;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #cdd6f4;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      z-index: 2147483647;
    }

    .cb-response-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #181825;
      border-bottom: 1px solid #313244;
      font-size: 11px;
      font-weight: 600;
      color: #89b4fa;
    }

    .cb-dismiss {
      background: transparent;
      border: none;
      color: #6c7086;
      font-size: 14px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }

    .cb-dismiss:hover { color: #f38ba8; }

    .cb-response-body {
      padding: 10px 12px;
      overflow-y: auto;
      flex: 1;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .cb-response-body p {
      margin: 4px 0;
    }

    /* ── Code blocks ── */

    .cb-code-block {
      position: relative;
      margin: 8px 0;
    }

    .cb-code-block pre {
      background: #11111b;
      border: 1px solid #313244;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 11px;
      font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre;
      color: #cdd6f4;
    }

    .cb-lang {
      position: absolute;
      top: 4px;
      right: 6px;
      font-size: 9px;
      color: #585b70;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .cb-code-actions {
      display: flex;
      gap: 5px;
      margin-top: 4px;
    }

    .cb-code-actions button {
      background: #313244;
      color: #a6adc8;
      border: 1px solid #45475a;
      border-radius: 5px;
      padding: 3px 10px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.12s;
    }

    .cb-code-actions button:hover {
      color: #cdd6f4;
      border-color: #6c7086;
    }

    .cb-btn-replace {
      color: #a6e3a1 !important;
      border-color: #3a5c3a !important;
    }

    .cb-btn-replace:hover {
      background: #1e3a1e !important;
      border-color: #a6e3a1 !important;
    }

    .cb-btn-done {
      color: #585b70 !important;
      border-color: transparent !important;
      cursor: default !important;
    }

    /* ── Loading ── */

    .cb-loading .cb-response-body {
      color: #a6adc8;
      font-style: italic;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cb-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #45475a;
      border-top-color: #89b4fa;
      border-radius: 50%;
      animation: cb-spin 0.6s linear infinite;
    }

    @keyframes cb-spin {
      to { transform: rotate(360deg); }
    }
  `;
})();
