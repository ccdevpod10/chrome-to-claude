import { diffLines } from "diff";
import type { Action, Diagnostic, SWMessage } from "../core/messages";
import { extractCode } from "../core/prompt-builder";
import { getShell, ICONS, escapeHtml } from "./ui-shell";

type Status = "streaming" | "done" | "error";
type Tab = "output" | "diff" | "original";

export interface PopupHandlers {
  onReplace: (text: string) => void;
  onRetry: () => void;
  onStop: (id: string) => void;
  onClose: () => void;
  onSettings: () => void;
}

interface State {
  id: string;
  action: Action;
  original: string;
  streamed: string;
  status: Status;
  error?: string;
  tab: Tab;
  copied: boolean;
}

export interface ResultPopupApi {
  showAt(rect: DOMRect): void;
  hide(): void;
  start(id: string, action: Action, original: string): void;
  pushChunk(id: string, delta: string): void;
  done(id: string, full: string): void;
  fail(id: string, error: string): void;
  setBusyMessage(message: string | null): void;
  setDiagnostics(d: Diagnostic[] | null): void;
  isOpen(): boolean;
  ingest(m: SWMessage): void;
}

export function createResultPopup(h: PopupHandlers): ResultPopupApi {
  const { layer } = getShell();

  const root = document.createElement("div");
  root.className = "popup floating";
  root.hidden = true;
  layer.appendChild(root);

  const state: State = {
    id: "", action: "improve", original: "", streamed: "",
    status: "streaming", tab: "output", copied: false,
  };

  // Build the chrome once. Update only mutable regions on render.
  root.innerHTML = `
    <header>
      <span class="brand">${ICONS.sparkle}</span>
      <div>
        <div class="title">AI Code Assistant</div>
        <div class="meta" data-region="meta"></div>
      </div>
      <span class="pill" data-region="pill" style="margin-left:auto"><span class="dot"></span><span data-region="pill-label"></span></span>
      <button class="icon-btn" data-act="settings" title="Settings">${ICONS.cog}</button>
      <button class="icon-btn" data-act="close" title="Close">${ICONS.close}</button>
    </header>

    <div class="err" data-region="error" hidden></div>

    <div class="busy" data-region="busy" hidden></div>

    <div class="diagnostics" data-region="diagnostics" hidden>
      <div class="diag-head"><span class="dot"></span> <span data-region="diag-title">Pre-flight findings</span></div>
      <ul data-region="diag-list"></ul>
    </div>

    <div class="tabs">
      <button data-tab="output">Output</button>
      <button data-tab="diff">Diff</button>
      <button data-tab="original">Original</button>
    </div>

    <div class="body" data-region="body"></div>

    <div class="stream-bar" data-region="stream-bar" hidden></div>

    <div class="notes" data-region="notes" hidden>
      <h4>${ICONS.sparkle} Notes</h4>
      <div data-region="notes-body"></div>
    </div>

    <div class="footer">
      <button class="btn primary" data-act="replace" disabled>${ICONS.replace} Replace</button>
      <button class="btn danger"  data-act="stop"    hidden>${ICONS.stop} Stop</button>
      <button class="btn ghost"   data-act="copy"    disabled><span data-region="copy-icon">${ICONS.copy}</span> <span data-region="copy-label">Copy</span></button>
      <button class="btn ghost"   data-act="retry">${ICONS.retry} Retry</button>
    </div>
  `;

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  const meta       = $('[data-region="meta"]');
  const pill       = $('[data-region="pill"]');
  const pillLabel  = $('[data-region="pill-label"]');
  const errBox     = $('[data-region="error"]');
  const busyBox    = $('[data-region="busy"]');
  const diagBox    = $('[data-region="diagnostics"]');
  const diagList   = $('[data-region="diag-list"]');
  const body       = $('[data-region="body"]');
  const streamBar  = $('[data-region="stream-bar"]');
  const notesBox   = $('[data-region="notes"]');
  const notesBody  = $('[data-region="notes-body"]');
  const tabBtns    = root.querySelectorAll<HTMLButtonElement>("[data-tab]");
  const btnReplace = root.querySelector('[data-act="replace"]') as HTMLButtonElement;
  const btnStop    = root.querySelector('[data-act="stop"]') as HTMLButtonElement;
  const btnCopy    = root.querySelector('[data-act="copy"]') as HTMLButtonElement;
  const copyIcon   = $('[data-region="copy-icon"]');
  const copyLabel  = $('[data-region="copy-label"]');

  // Wire static handlers (one time)
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => e.stopPropagation());
  tabBtns.forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab as Tab; render(); }));
  root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
    const act = b.dataset.act!;
    b.addEventListener("click", async () => {
      if (act === "close") { hide(); h.onClose(); }
      else if (act === "settings" || act === "open-settings") { h.onSettings(); }
      else if (act === "retry") { h.onRetry(); }
      else if (act === "stop") { h.onStop(state.id); }
      else if (act === "replace") { h.onReplace(extractCode(state.streamed).code); }
      else if (act === "copy") {
        await navigator.clipboard.writeText(extractCode(state.streamed).code);
        state.copied = true; render();
        setTimeout(() => { state.copied = false; render(); }, 1200);
      }
    });
  });

  let userPositioned = false;

  function clampToViewport(top: number, left: number, w: number, h: number) {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - w - margin);
    const maxTop  = Math.max(margin, window.innerHeight - h - margin);
    return {
      top:  Math.max(margin, Math.min(maxTop, top)),
      left: Math.max(margin, Math.min(maxLeft, left)),
    };
  }

  function position(rect: DOMRect) {
    root.hidden = false;
    if (userPositioned) {
      // Keep the user's chosen position; just make sure it's still on-screen.
      reflowIntoView();
      return;
    }
    const W = root.offsetWidth || 520;
    const H = Math.min(root.offsetHeight || 420, window.innerHeight - 16);
    // Prefer below the selection; flip above if it would clip.
    let top = rect.bottom + 8;
    if (top + H > window.innerHeight - 8) top = rect.top - H - 8;
    const { top: t, left: l } = clampToViewport(top, rect.left, W, H);
    root.style.top = `${t}px`;
    root.style.left = `${l}px`;
  }

  function reflowIntoView() {
    if (root.hidden) return;
    const r = root.getBoundingClientRect();
    const { top, left } = clampToViewport(r.top, r.left, r.width, r.height);
    if (Math.abs(top - r.top) > 0.5 || Math.abs(left - r.left) > 0.5) {
      root.style.top = `${top}px`;
      root.style.left = `${left}px`;
    }
  }

  // ===== Drag-to-move (header is the handle, buttons opt out) =====
  let dragging = false;
  let offX = 0;
  let offY = 0;

  function onDragStart(e: MouseEvent) {
    if (e.button !== 0) return;
    const tgt = e.target as Element | null;
    if (tgt?.closest("button")) return;          // let header buttons work
    const header = (e.currentTarget as Element).closest("header") as HTMLElement | null;
    if (!header) return;
    e.preventDefault();
    dragging = true;
    userPositioned = true;
    const r = root.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    root.classList.add("dragging");
    document.addEventListener("mousemove", onDragMove, true);
    document.addEventListener("mouseup", onDragEnd, true);
  }
  function onDragMove(e: MouseEvent) {
    if (!dragging) return;
    e.preventDefault();
    const W = root.offsetWidth;
    const H = root.offsetHeight;
    const { top, left } = clampToViewport(e.clientY - offY, e.clientX - offX, W, H);
    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
  }
  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("dragging");
    document.removeEventListener("mousemove", onDragMove, true);
    document.removeEventListener("mouseup", onDragEnd, true);
  }
  // Bind once to the header (built statically above).
  const headerEl = root.querySelector("header");
  headerEl?.addEventListener("mousedown", onDragStart);

  // Re-clamp on viewport resize.
  window.addEventListener("resize", reflowIntoView, { passive: true });

  function render() {
    const { code, notes } = extractCode(state.streamed);

    meta.textContent = actionLabel(state.action);

    pill.className = `pill ${state.status}`;
    pill.style.marginLeft = "auto";
    pillLabel.textContent =
      state.status === "streaming" ? "Streaming" :
      state.status === "done"      ? "Done" : "Error";

    // Error
    if (state.status === "error") {
      const wantSettings = /missing api key|no provider/i.test(state.error ?? "");
      errBox.innerHTML =
        escapeHtml(state.error ?? "") +
        (wantSettings ? `<div><button data-act="open-settings">Open Settings</button></div>` : "");
      errBox.hidden = false;
      // Re-bind any new "open-settings" button
      errBox.querySelectorAll<HTMLButtonElement>('[data-act="open-settings"]').forEach((b) =>
        b.addEventListener("click", () => h.onSettings()),
      );
    } else {
      errBox.hidden = true;
      errBox.innerHTML = "";
    }

    // Tabs active state
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));

    // Body — preserve scroll while streaming
    const wasNearBottom =
      body.scrollHeight - body.scrollTop - body.clientHeight < 24;
    body.innerHTML = renderBody(state.tab, state.original, code);
    if (state.status === "streaming" && wasNearBottom) {
      body.scrollTop = body.scrollHeight;
    } else if (state.status === "done" && body.scrollTop === 0) {
      // Done: stay at top so user sees the start of output
    }

    streamBar.hidden = state.status !== "streaming";

    // Notes
    if (notes && notes.trim()) {
      notesBody.innerHTML = renderNotes(notes);
      notesBox.hidden = false;
    } else {
      notesBox.hidden = true;
      notesBody.innerHTML = "";
    }

    // Footer buttons
    const haveCode = !!code;
    const replaceDisabled = state.status !== "done" || !haveCode;
    btnReplace.toggleAttribute("disabled", replaceDisabled);
    btnReplace.hidden = state.status === "streaming";
    btnStop.hidden = state.status !== "streaming";
    btnCopy.toggleAttribute("disabled", !haveCode);
    copyIcon.innerHTML = state.copied ? ICONS.check : ICONS.copy;
    copyLabel.textContent = state.copied ? "Copied" : "Copy";

    // Re-clamp after content/footer dims change.
    reflowIntoView();
  }

  function hide() {
    root.hidden = true;
    userPositioned = false;
  }

  return {
    showAt(rect) {
      render();
      position(rect);
    },
    hide,
    isOpen: () => !root.hidden,
    start(id, action, original) {
      Object.assign(state, { id, action, original, streamed: "", status: "streaming" as Status, tab: "output" as Tab, error: undefined, copied: false });
      // Clear transient panels from any prior run.
      busyBox.hidden = true; busyBox.innerHTML = "";
      diagBox.hidden = true; diagList.innerHTML = "";
      render();
      // New session: scroll to top
      body.scrollTop = 0;
    },
    pushChunk(id, delta) {
      if (id !== state.id) return;
      state.streamed += delta;
      // First chunk arrived → drop the "Running dry-run…" busy line if still up.
      busyBox.hidden = true;
      render();
    },
    setBusyMessage(message) {
      if (message) {
        busyBox.innerHTML = `<span class="spin"></span> ${escapeHtml(message)}`;
        busyBox.hidden = false;
      } else {
        busyBox.hidden = true;
        busyBox.innerHTML = "";
      }
      reflowIntoView();
    },
    setDiagnostics(d) {
      if (!d || !d.length) {
        diagBox.hidden = true;
        diagList.innerHTML = "";
        return;
      }
      const items = d.map((x) => {
        const cls = x.level === "error" ? "diag-error" : x.level === "warn" ? "diag-warn" : "diag-info";
        const tag = x.level.toUpperCase();
        return `<li class="${cls}"><span class="tag">${tag}</span> ${escapeHtml(x.message)}</li>`;
      }).join("");
      diagList.innerHTML = items;
      diagBox.hidden = false;
      reflowIntoView();
    },
    done(id, full) {
      if (id !== state.id) return;
      state.streamed = full;
      state.status = "done";
      render();
      body.scrollTop = 0;
    },
    fail(id, error) {
      if (id !== state.id) return;
      state.status = "error";
      state.error = error;
      render();
    },
    ingest(m) {
      if (m.type === "ASSIST_START") this.start(m.id, m.action, m.original);
      else if (m.type === "ASSIST_CHUNK") this.pushChunk(m.id, m.delta);
      else if (m.type === "ASSIST_DONE") this.done(m.id, m.full);
      else if (m.type === "ASSIST_ERROR") this.fail(m.id, m.error);
    },
  };
}

const ACTION_LABELS: Record<Action, string> = {
  fix: "Fix", improve: "Improve", audit: "Audit", debug: "Debug",
  review: "Review", explain: "Explain", "find-bugs": "Find Bugs",
  generate: "Generate", "write-tests": "Write Tests", "write-docs": "Write Docs", scaffold: "Scaffold",
  "debug-error": "Debug Error", trace: "Trace",
} as const;

function actionLabel(a: Action): string { return ACTION_LABELS[a] ?? a; }

function renderBody(tab: Tab, original: string, code: string): string {
  if (tab === "output") return renderCode(code);
  if (tab === "original") return renderCode(original);
  if (!code) return `<div class="empty">Waiting for output…</div>`;
  const parts = diffLines(original, code);
  const rows: string[] = [];
  for (const p of parts) {
    const lines = p.value.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const cls = p.added ? "add" : p.removed ? "del" : "eq";
    const sigil = p.added ? "+ " : p.removed ? "- " : "  ";
    for (const l of lines) {
      rows.push(`<div class="lc ${cls}">${escapeHtml(sigil + (l || " "))}</div>`);
    }
  }
  return `<div class="code" style="grid-template-columns:1fr">${rows.join("")}</div>`;
}

function renderCode(text: string): string {
  if (!text) return `<div class="empty">Waiting for output…</div>`;
  const lines = text.split("\n");
  const cells: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    cells.push(`<div class="ln">${i + 1}</div><div class="lc">${escapeHtml(lines[i] || " ")}</div>`);
  }
  return `<div class="code">${cells.join("")}</div>`;
}

function renderNotes(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let listOpen = false;
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
      if (!listOpen) { out.push("<ul>"); listOpen = true; }
      out.push(`<li>${inline(l.replace(/^([-*]|\d+\.)\s+/, ""))}</li>`);
    } else if (!l) {
      closeList();
    } else {
      closeList();
      out.push(`<p style="margin:4px 0">${inline(l)}</p>`);
    }
  }
  closeList();
  return out.join("");
}
