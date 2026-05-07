// Command Palette — opened via ⌘K / Ctrl+K.
// Renders inside the shared Shadow DOM layer (getShell().layer).
// Provides a search input + filtered action list; fires AssistRequest on Enter.

import { detect, DetectedSelection } from "./selection-detector";
import { getShell } from "./ui-shell";
import type { Action, AssistRequest } from "../core/messages";

// ---------------------------------------------------------------------------
// Action registry
// ---------------------------------------------------------------------------

const PALETTE_ACTIONS: { label: string; action: Action }[] = [
  { label: "Code Review",        action: "review" },
  { label: "Explain Code",       action: "explain" },
  { label: "Find Bugs",          action: "find-bugs" },
  { label: "Generate Code",      action: "generate" },
  { label: "Write Tests",        action: "write-tests" },
  { label: "Write Docs",         action: "write-docs" },
  { label: "Scaffold Component", action: "scaffold" },
  { label: "Fix",                action: "fix" },
  { label: "Debug Error",        action: "debug-error" },
  { label: "Trace Logic",        action: "trace" },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CommandPaletteApi {
  open(currentSelection?: DetectedSelection | null): void;
  close(): void;
  isOpen(): boolean;
}

export function createCommandPalette(
  onFire: (req: Pick<AssistRequest, "action" | "code" | "language" | "freeText" | "url">) => void,
): CommandPaletteApi {
  const { layer } = getShell();

  // -------------------------------------------------------------------------
  // DOM construction
  // -------------------------------------------------------------------------

  const backdrop = document.createElement("div");
  backdrop.className = "palette-backdrop";
  backdrop.setAttribute("hidden", "");

  const palette = document.createElement("div");
  palette.className = "palette";
  // Prevent backdrop-click from triggering when clicking inside the palette
  palette.addEventListener("click", (e) => e.stopPropagation());

  const input = document.createElement("input");
  input.className = "palette-input";
  input.type = "text";
  input.placeholder = "Search actions or describe what you need…";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");

  const divider = document.createElement("div");
  divider.className = "palette-divider";

  const list = document.createElement("div");
  list.className = "palette-list";
  list.setAttribute("role", "listbox");

  // Build action items
  const items: HTMLDivElement[] = PALETTE_ACTIONS.map(({ label, action }) => {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.setAttribute("role", "option");
    item.dataset["action"] = action;
    item.textContent = label;
    item.addEventListener("click", () => fire(action));
    list.appendChild(item);
    return item;
  });

  palette.appendChild(input);
  palette.appendChild(divider);
  palette.appendChild(list);
  backdrop.appendChild(palette);
  layer.appendChild(backdrop);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  let activeIdx = 0;
  let previousFocus: Element | null = null;
  let cachedSelection: DetectedSelection | null = null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function visibleItems(): HTMLDivElement[] {
    return items.filter((it) => !it.hasAttribute("data-hidden"));
  }

  function setActive(idx: number) {
    const visible = visibleItems();
    if (visible.length === 0) return;
    idx = Math.max(0, Math.min(idx, visible.length - 1));
    activeIdx = idx;
    items.forEach((it) => it.classList.remove("active"));
    visible[idx]?.classList.add("active");
    visible[idx]?.scrollIntoView({ block: "nearest" });
  }

  function filterList(query: string) {
    const q = query.trim().toLowerCase();
    items.forEach((it) => {
      const label = it.textContent?.toLowerCase() ?? "";
      if (q === "" || label.includes(q)) {
        it.removeAttribute("data-hidden");
      } else {
        it.setAttribute("data-hidden", "");
        it.classList.remove("active");
      }
    });
    setActive(0);
  }

  function fire(action?: Action) {
    const freeText = input.value.trim() || undefined;
    const resolvedAction: Action = action ?? (visibleItems()[activeIdx]?.dataset["action"] as Action) ?? "generate";

    let code = "";
    let language: string | undefined;

    if (cachedSelection) {
      code = cachedSelection.info.text;
      language = cachedSelection.info.language;
    }

    onFire({ action: resolvedAction, code, language, freeText, url: location.href });
    close();
  }

  // -------------------------------------------------------------------------
  // Keyboard handler
  // -------------------------------------------------------------------------

  function onKeyDown(e: KeyboardEvent) {
    if (!isOpen()) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(activeIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(activeIdx - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const visible = visibleItems();
        const selected = visible[activeIdx]?.dataset["action"] as Action | undefined;
        const freeText = input.value.trim();

        if (selected) {
          fire(selected);
        } else if (freeText) {
          // Free-text with no matching action → default to "generate"
          fire("generate");
        } else {
          fire("generate");
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Open / close
  // -------------------------------------------------------------------------

  function open(currentSelection?: DetectedSelection | null) {
    // Snapshot the selection passed in; fall back to an async detect() refresh
    cachedSelection = currentSelection ?? null;
    if (!cachedSelection) {
      // Kick off a fresh detect but don't wait — any results will update cachedSelection
      detect().then((sel) => { cachedSelection = sel; });
    }

    previousFocus = document.activeElement;

    // Reset state
    input.value = "";
    filterList("");

    backdrop.removeAttribute("hidden");
    input.focus();

    document.addEventListener("keydown", onKeyDown, true);
  }

  function close() {
    backdrop.setAttribute("hidden", "");
    document.removeEventListener("keydown", onKeyDown, true);

    // Restore focus to whatever had it before the palette opened
    if (previousFocus && previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  function isOpen(): boolean {
    return !backdrop.hasAttribute("hidden");
  }

  // -------------------------------------------------------------------------
  // Input filtering
  // -------------------------------------------------------------------------

  input.addEventListener("input", () => filterList(input.value));

  // -------------------------------------------------------------------------
  // Backdrop click closes palette
  // -------------------------------------------------------------------------

  backdrop.addEventListener("click", () => close());

  return { open, close, isOpen };
}
