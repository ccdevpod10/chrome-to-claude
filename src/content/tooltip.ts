import type { Action } from "../core/messages";

const HOST_ID = "__ai_assist_host__";
const STYLE = `
  :host{all:initial}
  .bar{position:fixed;display:flex;gap:4px;background:#0b0f17;color:#e6e9ef;
       border:1px solid #1f2937;border-radius:8px;padding:4px;
       font:12px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;
       box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:auto;z-index:2147483647}
  .bar button{background:#111827;border:1px solid #1f2937;color:#e6e9ef;
              padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit}
  .bar button:hover{background:#1f2937}
  .bar[hidden]{display:none}
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
      for (const a of ACTIONS) {
        const b = document.createElement("button");
        b.textContent = a[0].toUpperCase() + a.slice(1);
        b.dataset.action = a;
        b.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
        b.addEventListener("click", () => onPick(a));
        bar.appendChild(b);
      }
      const top = Math.max(8, rect.top - 40);
      const left = Math.max(8, Math.min(window.innerWidth - 240, rect.left));
      bar.style.top = `${top}px`;
      bar.style.left = `${left}px`;
      bar.hidden = false;
    },
    hide() { bar.hidden = true; },
    destroy() { host?.remove(); },
  };
}
