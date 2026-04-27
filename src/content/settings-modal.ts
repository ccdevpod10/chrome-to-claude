import { listProviders } from "../providers/registry";
import { getSettings, setSettings, type Settings } from "../utils/storage";
import { getShell, ICONS, escapeHtml } from "./ui-shell";

export interface SettingsModalApi {
  open(): Promise<void>;
  close(): void;
}

export function createSettingsModal(): SettingsModalApi {
  const { layer } = getShell();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.hidden = true;
  layer.appendChild(overlay);

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.addEventListener("mousedown", (e) => e.stopPropagation());
  modal.addEventListener("click", (e) => e.stopPropagation());
  overlay.appendChild(modal);

  overlay.addEventListener("mousedown", () => close());
  document.addEventListener("keydown", (e) => {
    if (!overlay.hidden && e.key === "Escape") close();
  });

  let settings: Settings | null = null;

  function close() {
    overlay.hidden = true;
  }

  function render(savedAt?: number) {
    if (!settings) return;
    const providers = listProviders();
    const hasKey = (id: string) => id === "local" || !!settings!.apiKeys[id]?.trim();

    modal.innerHTML = `
      <header>
        <span class="brand">${ICONS.sparkle}</span>
        <h2>Settings</h2>
        <button class="icon-btn" data-act="close" style="margin-left:auto" title="Close">${ICONS.close}</button>
      </header>

      <div class="scroll">
        <div class="grid2">
          <div class="field">
            <label>Primary provider</label>
            <select data-bind="providerId">
              ${providers.map((p) => `<option value="${p.id}" ${p.id === settings!.providerId ? "selected" : ""}>${escapeHtml(p.label)}${hasKey(p.id) ? " ✓" : ""}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Fallback provider</label>
            <select data-bind="fallbackProviderId">
              <option value="">— none —</option>
              ${providers.filter((p) => p.id !== settings!.providerId).map((p) => `<option value="${p.id}" ${p.id === (settings!.fallbackProviderId ?? "") ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
            </select>
          </div>
        </div>

        ${providers.map((p) => providerCard(p.id, p.label, p.id === settings!.providerId, hasKey(p.id), settings!)).join("")}
      </div>

      <footer>
        <button class="btn primary" data-act="save">${ICONS.check} Save settings</button>
        ${savedAt ? `<span class="saved">✓ Saved</span>` : ""}
        <span style="margin-left:auto; font-size:11px; color:#71717a">Stored in <code style="background:rgba(255,255,255,.06); padding:1px 5px; border-radius:4px; font: 11px ui-monospace,monospace">chrome.storage.local</code></span>
      </footer>
    `;

    // Bind fields
    modal.querySelectorAll<HTMLSelectElement>("select[data-bind]").forEach((el) => {
      const k = el.getAttribute("data-bind") as keyof Settings;
      el.addEventListener("change", () => {
        if (k === "fallbackProviderId") (settings as Settings).fallbackProviderId = el.value || undefined;
        else (settings as unknown as Record<string, unknown>)[k as string] = el.value;
        if (k === "providerId") render();
      });
    });
    modal.querySelectorAll<HTMLInputElement>("input[data-card]").forEach((inp) => {
      const card = inp.getAttribute("data-card")!;
      const field = inp.getAttribute("data-field") as "apiKeys" | "models" | "baseUrls";
      inp.addEventListener("input", () => {
        const map = (settings![field] ??= {}) as Record<string, string>;
        map[card] = inp.value;
      });
    });
    modal.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
      const act = b.getAttribute("data-act");
      b.addEventListener("click", async () => {
        if (act === "close") close();
        else if (act === "save") {
          await setSettings(settings!);
          render(Date.now());
          setTimeout(() => render(), 1500);
        }
      });
    });
  }

  function providerCard(id: string, label: string, isPrimary: boolean, configured: boolean, s: Settings): string {
    const apiKey = s.apiKeys[id] ?? "";
    const model = s.models[id] ?? "";
    const baseUrl = s.baseUrls?.[id] ?? "";
    return `
      <div class="card">
        <div class="head">
          <span>${escapeHtml(label)}</span>
          ${isPrimary ? `<span class="tag primary">Primary</span>` : ""}
          <span class="tag ${configured ? "ok" : "off"}">${configured ? "Configured" : "Not configured"}</span>
        </div>
        <div class="grid2">
          ${id !== "local" ? `
            <div class="field">
              <label>API key</label>
              <input type="password" autocomplete="off" data-card="${id}" data-field="apiKeys" value="${escapeHtml(apiKey)}" placeholder="sk-…" />
            </div>` : ""}
          <div class="field">
            <label>Model</label>
            <input data-card="${id}" data-field="models" value="${escapeHtml(model)}" />
          </div>
          <div class="field" style="grid-column: 1 / -1">
            <label>Base URL (optional)</label>
            <input data-card="${id}" data-field="baseUrls" value="${escapeHtml(baseUrl)}" placeholder="${id === "local" ? "http://localhost:11434/v1" : ""}" />
          </div>
        </div>
      </div>
    `;
  }

  return {
    async open() {
      settings = await getSettings();
      overlay.hidden = false;
      render();
    },
    close,
  };
}
