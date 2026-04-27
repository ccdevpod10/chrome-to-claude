export interface Settings {
  providerId: string;
  fallbackProviderId?: string;
  apiKeys: Record<string, string>;
  models: Record<string, string>;
  baseUrls?: Record<string, string>;
}

export const DEFAULTS: Settings = {
  providerId: "openrouter",
  apiKeys: {},
  models: {
    openrouter: "openai/gpt-4o-mini",
    openai: "gpt-4o-mini",
    anthropic: "claude-sonnet-4-6",
    local: "",
  },
  baseUrls: {
    openrouter: "https://openrouter.ai/api/v1",
    local: "http://localhost:11434/v1",
  },
};

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(r.settings ?? {}) };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await chrome.storage.local.set({ settings: { ...cur, ...patch } });
}
