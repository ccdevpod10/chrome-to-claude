// Synchronous-style RPC to the MAIN-world bridge in main-world.ts.
// Uses dispatchEvent + a one-shot listener; resolves on first matching id.

let nextId = 0;
const pending = new Map<string, (r: { ok: boolean; data: unknown; error?: string }) => void>();

window.addEventListener("__ai_assist_res", (ev: Event) => {
  const e = ev as CustomEvent<{ id: string; ok: boolean; data: unknown; error?: string }>;
  const cb = pending.get(e.detail.id);
  if (!cb) return;
  pending.delete(e.detail.id);
  cb({ ok: e.detail.ok, data: e.detail.data, error: e.detail.error });
});

export function bridgeCall<T = unknown>(op: string, payload?: Record<string, unknown>, timeoutMs = 200): Promise<T | null> {
  const id = `${Date.now()}_${nextId++}`;
  return new Promise((resolve) => {
    const t = window.setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, (r) => {
      window.clearTimeout(t);
      if (!r.ok) return resolve(null);
      resolve(r.data as T);
    });
    window.dispatchEvent(new CustomEvent("__ai_assist_req", { detail: { id, op, payload } }));
  });
}
