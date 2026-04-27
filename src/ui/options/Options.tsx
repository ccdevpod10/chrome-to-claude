import { useEffect, useState } from "react";
import { listProviders } from "../../providers/registry";
import { getSettings, setSettings, Settings } from "../../utils/storage";

export default function Options() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const providers = listProviders();

  useEffect(() => { getSettings().then(setS); }, []);
  if (!s) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const updateMap = (k: "apiKeys" | "models" | "baseUrls", id: string, v: string) =>
    setS({ ...s, [k]: { ...(s[k] ?? {}), [id]: v } });

  const save = async () => {
    await setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const hasKey = (id: string) => id === "local" || !!s.apiKeys[id]?.trim();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6 text-[13px] text-neutral-200">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m5.6 5.6 2.8 2.8"/><path d="m15.6 15.6 2.8 2.8"/><path d="m18.4 5.6-2.8 2.8"/><path d="m8.4 15.6-2.8 2.8"/></svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">AI Code Assistant</h1>
            <p className="text-xs text-neutral-500">Settings</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Primary provider">
          <select
            value={s.providerId}
            onChange={(e) => update("providerId", e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-2.5"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} {hasKey(p.id) ? "✓" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fallback provider">
          <select
            value={s.fallbackProviderId ?? ""}
            onChange={(e) => update("fallbackProviderId", e.target.value || undefined)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-2.5"
          >
            <option value="">— none —</option>
            {providers.filter((p) => p.id !== s.providerId).map((p) =>
              <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
      </section>

      <div className="space-y-4">
        {providers.map((p) => (
          <ProviderCard key={p.id}
            id={p.id} label={p.label}
            isPrimary={p.id === s.providerId}
            apiKey={s.apiKeys[p.id] ?? ""}
            model={s.models[p.id] ?? ""}
            baseUrl={s.baseUrls?.[p.id] ?? ""}
            onChange={(field, v) => updateMap(field, p.id, v)}
          />
        ))}
      </div>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]/95 backdrop-blur p-3">
        <button
          onClick={save}
          className="rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-indigo-900/40 hover:from-indigo-400 hover:to-indigo-500"
        >Save settings</button>
        {saved && <span className="text-[12px] text-emerald-400">✓ Saved</span>}
        <p className="ml-auto text-[11px] text-neutral-500">Keys stay in <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-code">chrome.storage.local</code></p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function ProviderCard(props: {
  id: string; label: string; isPrimary: boolean;
  apiKey: string; model: string; baseUrl: string;
  onChange: (field: "apiKeys" | "models" | "baseUrls", v: string) => void;
}) {
  const { id, label, isPrimary, apiKey, model, baseUrl, onChange } = props;
  const configured = id === "local" || !!apiKey.trim();
  return (
    <fieldset className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-4 space-y-3">
      <legend className="flex items-center gap-2 px-1 text-[13px] font-semibold">
        {label}
        {isPrimary && <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-indigo-300">Primary</span>}
        <span className={`ml-auto text-[10px] uppercase tracking-wider ${configured ? "text-emerald-400" : "text-neutral-500"}`}>
          {configured ? "Configured" : "Not configured"}
        </span>
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {id !== "local" && (
          <Field label="API key">
            <input
              type="password" autoComplete="off"
              value={apiKey}
              onChange={(e) => onChange("apiKeys", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-2.5 font-code text-[12px]"
              placeholder="sk-…"
            />
          </Field>
        )}
        <Field label="Model">
          <input
            value={model}
            onChange={(e) => onChange("models", e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-2.5 font-code text-[12px]"
          />
        </Field>
        <Field label="Base URL (optional)">
          <input
            value={baseUrl}
            onChange={(e) => onChange("baseUrls", e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-2.5 font-code text-[12px]"
            placeholder={id === "local" ? "http://localhost:11434/v1" : ""}
          />
        </Field>
      </div>
    </fieldset>
  );
}
