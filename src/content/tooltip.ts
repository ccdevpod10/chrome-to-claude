import type { Action } from "../core/messages";

const HOST_ID = "__ai_assist_host__";
const STYLE = `
  :host{all:initial}
  @keyframes tt-in { from { opacity:0; transform: translateY(4px) scale(.97); } to { opacity:1; transform: none; } }
  .bar{
    position:fixed;display:flex;align-items:center;gap:2px;
    background:rgba(15,15,20,.92);
    color:#ededf0;
    border:1px solid rgba(255,255,255,.08);
    border-radius:10px;padding:4px;
    font:500 12px/1 ui-sans-serif,-apple-system,"SF Pro Text","Inter",system-ui,Segoe UI,Roboto;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.3);
    pointer-events:auto;z-index:2147483647;
    animation: tt-in 130ms ease-out;
  }
  .brand{
    display:grid;place-items:center;width:22px;height:22px;margin-left:2px;margin-right:4px;
    border-radius:6px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
  }
  .brand svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .bar button{
    background:transparent;border:0;color:#d4d4d8;
    padding:6px 10px;border-radius:7px;cursor:pointer;font:inherit;
    transition:background-color 120ms,color 120ms;
  }
  .bar button:hover{background:rgba(255,255,255,.06);color:#fff}
  .bar button:active{background:rgba(255,255,255,.1)}
  .bar[hidden]{display:none}
  .sep{width:1px;height:16px;background:rgba(255,255,255,.08);margin:0 2px}
`;

export interface TooltipApi {
  show(rect: DOMRect, onPick: (a: Action) => void): void;
  hide(): void;
  destroy(): void;
}

export function createTooltip(): TooltipApi {
  let host = document.getElementById(HOST_ID) as HTMLDivElement | null;
  let shadow: ShadowRoot;
  let bar: HTMLDivElement;

  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483647",
    } as Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    bar = document.createElement("div");
    bar.className = "bar";
    bar.hidden = true;
    shadow.appendChild(style);
    shadow.appendChild(bar);
    (host as unknown as { __shadow: ShadowRoot; __bar: HTMLDivElement }).__shadow = shadow;
    (host as unknown as { __bar: HTMLDivElement }).__bar = bar;
  } else {
    shadow = (host as unknown as { __shadow: ShadowRoot }).__shadow;
    bar = (host as unknown as { __bar: HTMLDivElement }).__bar;
  }

  const ACTIONS: Action[] = ["fix", "improve", "audit", "debug"];

  return {
    show(rect, onPick) {
      bar.innerHTML = "";
      const brand = document.createElement("span");
      brand.className = "brand";
      brand.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m5.6 5.6 2.8 2.8"/><path d="m15.6 15.6 2.8 2.8"/><path d="m18.4 5.6-2.8 2.8"/><path d="m8.4 15.6-2.8 2.8"/></svg>`;
      bar.appendChild(brand);
      const sep = document.createElement("span"); sep.className = "sep"; bar.appendChild(sep);
      for (const a of ACTIONS) {
        const b = document.createElement("button");
        b.textContent = a[0].toUpperCase() + a.slice(1);
        b.dataset.action = a;
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => onPick(a));
        bar.appendChild(b);
      }
      const top = Math.max(8, rect.top - 44);
      const left = Math.max(8, Math.min(window.innerWidth - 280, rect.left));
      bar.style.top = `${top}px`;
      bar.style.left = `${left}px`;
      bar.hidden = false;
    },
    hide() { bar.hidden = true; },
    destroy() { host?.remove(); },
  };
}
