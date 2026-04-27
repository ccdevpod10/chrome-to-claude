import { useEffect, useState } from "react";
import { listProviders } from "../../providers/registry";
import { getSettings, setSettings, Settings } from "../../utils/storage";

export default function Options() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const providers = listProviders();

  useEffect(() => { getSettings().then(setS); }, []);
  if (!s) return <div className="p-6 text-sm">Loading…</div>;

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const updateMap = (k: "apiKeys" | "models" | "baseUrls", id: string, v: string) =>
    setS({ ...s, [k]: { ...(s[k] ?? {}), [id]: v } });

  const save = async () => {
    await setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6 text-sm">
      <h1 className="text-xl font-semibold">AI Code Assistant — Settings</h1>

      <section className="space-y-2">
        <label className="block">
          <span className="opacity-70">Primary provider</span>
          <select
            value={s.providerId}
            onChange={(e) => update("providerId", e.target.value)}
            className="mt-1 block w-full rounded bg-neutral-900 border border-neutral-800 p-2"
          >
            {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="opacity-70">Fallback provider (optional)</span>
          <select
            value={s.fallbackProviderId ?? ""}
            onChange={(e) => update("fallbackProviderId", e.target.value || undefined)}
            className="mt-1 block w-full rounded bg-neutral-900 border border-neutral-800 p-2"
          >
            <option value="">— none —</option>
            {providers.filter((p) => p.id !== s.providerId).map((p) =>
              <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </section>

      {providers.map((p) => (
        <fieldset key={p.id} className="rounded border border-neutral-800 p-4 space-y-2">
          <legend className="px-1 text-xs uppercase tracking-wider opacity-70">{p.label}</legend>
          {p.id !== "local" && (
            <label className="block">
              <span className="opacity-70">API key</span>
              <input
                type="password"
                autoComplete="off"
                value={s.apiKeys[p.id] ?? ""}
                onChange={(e) => updateMap("apiKeys", p.id, e.target.value)}
                className="mt-1 block w-full rounded bg-neutral-900 border border-neutral-800 p-2 font-mono"
              />
            </label>
          )}
          <label className="block">
            <span className="opacity-70">Model</span>
            <input
              value={s.models[p.id] ?? ""}
              onChange={(e) => updateMap("models", p.id, e.target.value)}
              className="mt-1 block w-full rounded bg-neutral-900 border border-neutral-800 p-2 font-mono"
            />
          </label>
          <label className="block">
            <span className="opacity-70">Base URL (optional)</span>
            <input
              value={s.baseUrls?.[p.id] ?? ""}
              onChange={(e) => updateMap("baseUrls", p.id, e.target.value)}
              className="mt-1 block w-full rounded bg-neutral-900 border border-neutral-800 p-2 font-mono"
              placeholder={p.id === "local" ? "http://localhost:11434/v1" : ""}
            />
          </label>
        </fieldset>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
        >Save</button>
        {saved && <span className="text-emerald-400 text-xs">Saved</span>}
      </div>

      <p className="text-xs opacity-60">
        Keys are stored in <code>chrome.storage.local</code>. They never leave the service worker.
      </p>
    </div>
  );
}
