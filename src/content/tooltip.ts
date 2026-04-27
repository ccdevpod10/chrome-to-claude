import type { Action } from "../core/messages";
import { getShell, ICONS } from "./ui-shell";

const ACTIONS: Action[] = ["fix", "improve", "audit", "debug"];

export interface TooltipApi {
  show(rect: DOMRect, onPick: (a: Action) => void, onSettings: () => void): void;
  hide(): void;
  destroy(): void;
}

export function createTooltip(): TooltipApi {
  const { layer } = getShell();
  let node = layer.querySelector(".bar.floating") as HTMLDivElement | null;
  if (!node) {
    node = document.createElement("div");
    node.className = "bar floating";
    node.hidden = true;
    layer.appendChild(node);
  }

  return {
    show(rect, onPick, onSettings) {
      node!.innerHTML = "";
      const brand = document.createElement("span");
      brand.className = "brand";
      brand.innerHTML = ICONS.sparkle;
      node!.appendChild(brand);

      const sep = document.createElement("span"); sep.className = "sep"; node!.appendChild(sep);

      for (const a of ACTIONS) {
        const b = document.createElement("button");
        b.textContent = a[0].toUpperCase() + a.slice(1);
        b.dataset.action = a;
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => onPick(a));
        node!.appendChild(b);
      }

      const sep2 = document.createElement("span"); sep2.className = "sep"; node!.appendChild(sep2);

      const cog = document.createElement("button");
      cog.className = "icon-btn";
      cog.title = "Settings";
      cog.innerHTML = ICONS.cog;
      cog.addEventListener("mousedown", (e) => e.preventDefault());
      cog.addEventListener("click", onSettings);
      node!.appendChild(cog);

      // Position above selection. Recalculate after layout to clamp width.
      node!.hidden = false;
      const w = node!.offsetWidth || 320;
      const top = Math.max(8, rect.top - 44);
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left));
      node!.style.top = `${top}px`;
      node!.style.left = `${left}px`;
    },
    hide() { if (node) node.hidden = true; },
    destroy() { node?.remove(); },
  };
}
