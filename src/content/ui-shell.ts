// Shared Shadow-DOM host for tooltip, response popup, and settings modal.
// One shadow root, isolated styles, single z-index ceiling.

const HOST_ID = "__ai_assist_host__";

const STYLE = `
  :host{ all: initial; }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }

  /* Scrollbars (host pages often hide them; we need our own inside the shadow) */
  *::-webkit-scrollbar { width: 10px; height: 10px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
  *::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.22); border: 2px solid transparent; background-clip: padding-box; }
  *::-webkit-scrollbar-corner { background: transparent; }
  * { scrollbar-color: rgba(255,255,255,.18) transparent; scrollbar-width: thin; }
  .layer{
    position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
    font: 500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text","Inter",system-ui,Segoe UI,Roboto;
    color: #ededf0;
  }
  .floating { pointer-events: auto; position: fixed; }

  /* ===== Tooltip bar ===== */
  @keyframes tt-in { from { opacity:0; transform: translateY(4px) scale(.97); } to { opacity:1; transform: none; } }
  .bar{
    display:flex; align-items:center; gap:2px;
    background: rgba(15,15,20,.92);
    border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:4px;
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.3);
    animation: tt-in 130ms ease-out;
  }
  .brand{
    display:grid; place-items:center; width:22px; height:22px; margin: 0 4px 0 2px;
    border-radius:6px; background: linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff;
  }
  .brand svg, .icon-btn svg { width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  .bar button{
    background:transparent; border:0; color:#d4d4d8; padding:6px 10px; border-radius:7px;
    cursor:pointer; font: inherit; transition: background-color 120ms, color 120ms;
  }
  .bar button:hover{ background: rgba(255,255,255,.06); color:#fff; }
  .icon-btn{
    width:28px; height:28px; display:grid; place-items:center; border-radius:7px;
    background:transparent; border:0; color:#a1a1aa; cursor:pointer;
  }
  .icon-btn:hover{ background: rgba(255,255,255,.06); color:#fff; }
  .sep{ width:1px; height:16px; background: rgba(255,255,255,.08); margin: 0 2px; }

  /* ===== Response popup ===== */
  @keyframes pop-in { from { opacity:0; transform: translateY(6px) scale(.98); } to { opacity:1; transform: none; } }
  .popup{
    width: 520px; max-width: calc(100vw - 24px);
    max-height: min(560px, calc(100vh - 32px));
    display:flex; flex-direction:column;
    background: rgba(10,10,11,.96);
    border:1px solid rgba(255,255,255,.08); border-radius:14px;
    box-shadow: 0 24px 64px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.3);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    overflow: hidden;
    animation: pop-in 160ms ease-out;
  }
  .popup.dragging{ transition:none; user-select:none; }
  .popup header{
    display:flex; align-items:center; gap:8px; padding:10px 12px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    background: rgba(255,255,255,.02);
    cursor: grab; user-select: none; touch-action: none;
  }
  .popup.dragging header{ cursor: grabbing; }
  .popup header .icon-btn,
  .popup header button{ cursor: pointer; }
  .popup header .title{ font-weight:600; font-size:13px; }
  .popup header .meta{ font-size:11px; color:#71717a; }
  .pill{
    display:inline-flex; align-items:center; gap:6px; padding:2px 8px;
    border-radius:999px; font-size:10.5px; font-weight:500;
  }
  .pill .dot{ width:6px; height:6px; border-radius:50%; }
  .pill.streaming{ background: rgba(99,102,241,.15); color:#a5b4fc; } .pill.streaming .dot{ background:#818cf8; animation: dotPulse 1.2s ease-in-out infinite; }
  .pill.done{ background: rgba(16,185,129,.15); color:#6ee7b7; } .pill.done .dot{ background:#34d399; }
  .pill.error{ background: rgba(244,63,94,.15); color:#fda4af; } .pill.error .dot{ background:#fb7185; }
  @keyframes dotPulse { 0%,100%{ opacity:.35 } 50%{ opacity:1 } }

  .tabs{ display:inline-flex; gap:2px; margin: 10px 12px 0; padding:3px;
    background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); border-radius:9px; align-self:flex-start; }
  .tabs button{
    border:0; background:transparent; color:#a1a1aa; padding:5px 10px; border-radius:6px;
    font: 500 12px/1 inherit; cursor:pointer;
  }
  .tabs button.active{ background: rgba(255,255,255,.08); color:#fff; box-shadow: 0 0 0 1px rgba(255,255,255,.04); }

  .body{ flex:1 1 auto; min-height: 120px; overflow:auto; margin: 8px 12px 0;
    border:1px solid rgba(255,255,255,.06); border-radius:10px; background: rgba(255,255,255,.02); }
  .stream-bar{ height:2px; width:100%;
    background: linear-gradient(90deg, transparent, rgba(99,102,241,.5), transparent);
    background-size: 200% 100%; animation: shim 1.6s linear infinite; }
  @keyframes shim { 0%{ background-position: -200% 0 } 100%{ background-position: 200% 0 } }

  .code{ font: 12px/1.55 ui-monospace,"JetBrains Mono","SF Mono",Menlo,Consolas,monospace;
    display:grid; grid-template-columns: auto 1fr; }
  .ln{ user-select:none; padding: 0 8px; text-align:right; color:#52525b; border-right:1px solid rgba(255,255,255,.05); }
  .lc{ padding: 0 12px; white-space:pre; color:#e4e4e7; }
  .lc.add{ background: rgba(16,185,129,.08); color:#a7f3d0; }
  .lc.del{ background: rgba(244,63,94,.08); color:#fecdd3; }
  .lc.eq { color:#d4d4d8; }
  .empty{ padding: 16px; color:#52525b; font-size:12px; font-style:italic; }

  .notes{ margin: 8px 12px 0; padding: 10px 12px; border:1px solid rgba(255,255,255,.06);
    background: rgba(255,255,255,.02); border-radius:10px; font-size:12px; color:#d4d4d8;
    line-height:1.55; max-height: 30vh; overflow:auto; flex: 0 1 auto; }
  .notes h4{ margin:0 0 6px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:#71717a; display:flex; align-items:center; gap:4px; }
  .notes h4 svg{ width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; flex:0 0 auto; }
  .notes ul{ padding-left: 20px; margin: 4px 0; }
  .notes li{ margin: 3px 0; }
  .notes code{ background: rgba(255,255,255,.06); color:#fcd34d; padding: 1px 5px; border-radius:4px; font: 11px ui-monospace,monospace; }
  .notes strong{ color:#fff; font-weight:600; }

  .footer{ display:flex; gap:6px; padding:10px 12px; border-top:1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.02); }
  .btn{
    display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px;
    font: 500 12px/1 inherit; cursor:pointer; border:1px solid transparent; transition: all 120ms;
  }
  .btn[disabled]{ opacity:.4; cursor: not-allowed; }
  .btn.primary{ background: linear-gradient(180deg,#6366f1,#4f46e5); color:#fff; box-shadow: 0 1px 0 rgba(255,255,255,.1) inset, 0 4px 12px rgba(79,70,229,.35); }
  .btn.primary:hover:not([disabled]){ background: linear-gradient(180deg,#7c81f5,#6366f1); }
  .btn.danger{ background: linear-gradient(180deg,#f43f5e,#e11d48); color:#fff; box-shadow: 0 4px 12px rgba(225,29,72,.35); }
  .btn.ghost{ background: rgba(255,255,255,.04); color:#e4e4e7; border-color: rgba(255,255,255,.08); }
  .btn.ghost:hover:not([disabled]){ background: rgba(255,255,255,.08); }
  .btn svg{ width:13px; height:13px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

  .err{ margin: 10px 12px 0; padding:10px 12px; border-radius:10px; font-size:12px;
    background: rgba(244,63,94,.1); border:1px solid rgba(244,63,94,.3); color:#fecaca; }

  .busy{ margin: 10px 12px 0; padding: 8px 12px; border-radius:10px; font-size:12px;
    background: rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.25); color:#c7d2fe;
    display:flex; align-items:center; gap:8px; }
  .busy .spin{ width:12px; height:12px; border-radius:50%;
    border:2px solid rgba(199,210,254,.25); border-top-color:#a5b4fc;
    animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .diagnostics{ margin: 10px 12px 0; padding: 10px 12px; border-radius:10px;
    background: rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08);
    max-height: 22vh; overflow:auto; }
  .diagnostics .diag-head{ display:flex; align-items:center; gap:6px;
    font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em;
    color:#a1a1aa; margin-bottom:6px; }
  .diagnostics .diag-head .dot{ width:6px; height:6px; border-radius:50%; background:#a5b4fc; }
  .diagnostics ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:4px; }
  .diagnostics li{ font-size:12px; line-height:1.5; display:flex; gap:6px; align-items:flex-start; }
  .diagnostics li .tag{ flex:0 0 auto; font: 600 9px/1.6 ui-monospace, monospace;
    padding: 1px 6px; border-radius:4px; letter-spacing:.04em; }
  .diagnostics li.diag-error{ color:#fecaca; } .diagnostics li.diag-error .tag{ background:rgba(244,63,94,.2); color:#fda4af; }
  .diagnostics li.diag-warn { color:#fde68a; } .diagnostics li.diag-warn  .tag{ background:rgba(245,158,11,.2); color:#fcd34d; }
  .diagnostics li.diag-info { color:#bae6fd; } .diagnostics li.diag-info  .tag{ background:rgba(56,189,248,.2); color:#7dd3fc; }
  .err button{
    margin-top: 6px; background: rgba(244,63,94,.85); color:#fff; border:0; padding:5px 10px;
    border-radius:6px; cursor:pointer; font: 500 11px/1 inherit;
  }

  /* ===== Settings modal ===== */
  @keyframes ovIn { from{opacity:0} to{opacity:1} }
  .overlay{
    position:fixed; inset:0; background: rgba(0,0,0,.55); backdrop-filter: blur(2px);
    pointer-events: auto; display:grid; place-items:center; padding: 24px;
    animation: ovIn 120ms ease-out;
  }
  .modal{
    width: 560px; max-width:100%; max-height: 80vh; display:flex; flex-direction:column;
    background: rgba(10,10,11,.98); border:1px solid rgba(255,255,255,.08);
    border-radius:16px; box-shadow: 0 30px 80px rgba(0,0,0,.6); overflow:hidden;
    animation: pop-in 160ms ease-out;
  }
  .modal header{
    display:flex; align-items:center; gap:10px; padding:14px 16px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .modal header h2{ margin:0; font-size:15px; font-weight:600; }
  .modal .scroll{ overflow:auto; padding: 14px 16px; display:flex; flex-direction:column; gap:14px; }
  .modal footer{
    display:flex; gap:8px; align-items:center; padding:12px 16px;
    border-top:1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.02);
  }
  .field{ display:flex; flex-direction:column; gap:4px; }
  .field label{ font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:#71717a; }
  .field input, .field select{
    width:100%; padding: 8px 10px; border-radius:8px;
    background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
    color:#ededf0; font: 12px ui-monospace, monospace; outline:none;
  }
  .field input:focus, .field select:focus{ border-color:#6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.2); }
  .grid2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .card{ border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:12px; background: rgba(255,255,255,.02); }
  .card .head{ display:flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:600; font-size:13px; }
  .card .head .tag{ font-size:10px; padding:2px 7px; border-radius:999px; text-transform:uppercase; letter-spacing:.06em; }
  .card .head .tag.primary{ background: rgba(99,102,241,.15); color:#a5b4fc; }
  .card .head .tag.ok{ background: rgba(16,185,129,.15); color:#6ee7b7; margin-left:auto; }
  .card .head .tag.off{ background: rgba(255,255,255,.06); color:#71717a; margin-left:auto; }
  .saved{ font-size:11px; color:#34d399; }

  /* ===== Command palette ===== */
  @keyframes palette-in { from { opacity:0; transform: translateY(-8px) scale(.97); } to { opacity:1; transform: none; } }
  .palette-backdrop{
    position:fixed; inset:0; background: rgba(0,0,0,.5);
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    pointer-events: auto;
    display:grid; place-items: center start; align-content: start;
    padding-top: min(12vh, 120px);
    z-index: 1;
  }
  .palette{
    width: 560px; max-width: calc(100vw - 32px);
    background: rgba(10,10,11,.97);
    border:1px solid rgba(255,255,255,.1); border-radius:12px;
    box-shadow: 0 24px 64px rgba(0,0,0,.65), 0 0 0 1px rgba(0,0,0,.4);
    overflow: hidden;
    animation: palette-in 150ms ease-out;
    justify-self: center;
  }
  .palette-input{
    display:block; width:100%; padding: 14px 16px;
    background: transparent; border:0; outline:none;
    color:#ededf0; font: 500 16px/1.4 ui-sans-serif,-apple-system,"SF Pro Text","Inter",system-ui,Segoe UI,Roboto;
    caret-color: #6366f1;
  }
  .palette-input::placeholder{ color:#52525b; }
  .palette-divider{ height:1px; background: rgba(255,255,255,.07); margin: 0; }
  .palette-list{
    overflow-y: auto; max-height: 320px;
    padding: 4px 0;
  }
  .palette-item{
    display:flex; align-items:center; padding: 10px 16px;
    cursor:pointer; font-size:13px; color:#d4d4d8;
    transition: background-color 80ms;
    border-left: 2px solid transparent;
  }
  .palette-item:hover{ background: rgba(255,255,255,.04); color:#fff; }
  .palette-item.active{
    background: rgba(99,102,241,.18); color:#e0e7ff;
    border-left-color: #6366f1;
  }
  .palette-item[data-hidden]{ display:none; }
`;

interface Shell {
  shadow: ShadowRoot;
  layer: HTMLDivElement;
}

let shell: Shell | null = null;

export function getShell(): Shell {
  if (shell) return shell;
  // If an old host element survives from a previous content-script injection
  // (extension reload while the page stays alive), drop it. Closed shadow roots
  // are not externally re-attachable, so we must recreate from scratch.
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  // Inline styles on the host: z-index inside a Shadow Root is scoped to the
  // shadow's own stacking context, so the host element itself must claim the
  // top-most layer in the outer document. Without this, page UI with positive
  // z-index occludes our tooltip / popup / modal.
  host.style.cssText =
    "position:fixed;inset:0;width:0;height:0;pointer-events:none;z-index:2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  shadow.appendChild(style);

  const layer = document.createElement("div");
  layer.className = "layer";
  shadow.appendChild(layer);
  shell = { shadow, layer };
  return shell;
}

export const ICONS = {
  sparkle: `<svg viewBox="0 0 24 24"><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m5.6 5.6 2.8 2.8"/><path d="m15.6 15.6 2.8 2.8"/><path d="m18.4 5.6-2.8 2.8"/><path d="m8.4 15.6-2.8 2.8"/></svg>`,
  cog: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`,
  retry: `<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
  stop: `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>`,
  replace: `<svg viewBox="0 0 24 24"><path d="M3 7h13"/><path d="m12 3 4 4-4 4"/><path d="M21 17H8"/><path d="m12 21-4-4 4-4"/></svg>`,
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));
}
