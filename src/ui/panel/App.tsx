import { useEffect, useMemo, useRef, useState } from "react";
import { extractCode } from "../../core/prompt-builder";
import type { SWMessage, Action } from "../../core/messages";
import DiffView from "./DiffView";

type Status = "idle" | "streaming" | "done" | "error";
type Tab = "output" | "diff" | "original";

interface SessionState {
  id: string;
  action: Action;
  original: string;
  streamed: string;
  status: Status;
  error?: string;
  tabId: number;
}

const EMPTY: SessionState = {
  id: "",
  action: "improve",
  original: "",
  streamed: "",
  status: "idle",
  tabId: -1,
};

export default function App() {
  const [s, setS] = useState<SessionState>(EMPTY);
  const [tab, setTab] = useState<Tab>("output");
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "panel" });
    portRef.current = port;
    const onMessage = (m: SWMessage) => {
      if (m.type === "ASSIST_START") {
        setS({ id: m.id, action: m.action, original: m.original, streamed: "", status: "streaming", tabId: m.tabId });
        setTab("output");
      } else if (m.type === "ASSIST_CHUNK") {
        setS((p) => (p.id === m.id ? { ...p, streamed: p.streamed + m.delta } : p));
      } else if (m.type === "ASSIST_DONE") {
        setS((p) => (p.id === m.id ? { ...p, streamed: m.full, status: "done" } : p));
      } else if (m.type === "ASSIST_ERROR") {
        setS((p) => (p.id === m.id ? { ...p, status: "error", error: m.error } : p));
      }
    };
    port.onMessage.addListener(onMessage);
    return () => { port.disconnect(); };
  }, []);

  const { code, notes } = useMemo(() => extractCode(s.streamed), [s.streamed]);

  const replace = async () => {
    if (s.tabId < 0) return;
    try {
      await chrome.tabs.sendMessage(s.tabId, { type: "REPLACE_SELECTION", text: code });
    } catch (e) { console.error(e); }
  };
  const copy = () => navigator.clipboard.writeText(code);
  const retry = () => {
    if (s.tabId < 0) return;
    chrome.tabs.sendMessage(s.tabId, { type: "TRIGGER_TOOLTIP" }).catch(() => {});
  };
  const stop = () => {
    if (s.id) chrome.runtime.sendMessage({ type: "ASSIST_CANCEL", id: s.id }).catch(() => {});
  };

  return (
    <div className="flex h-full flex-col p-3 gap-3 text-neutral-100">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide opacity-80">
          AI Code Assistant {s.action !== "improve" && `· ${s.action}`}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => chrome.runtime.openOptionsPage()}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] hover:bg-neutral-800">
            Settings
          </button>
          <span className={badgeCls(s.status)}>{s.status}</span>
        </div>
      </header>

      {s.status === "error" && (
        <div className="rounded border border-red-700 bg-red-950/40 p-2 text-xs text-red-200 space-y-2">
          <div>{s.error}</div>
          {/missing api key|no provider/i.test(s.error ?? "") && (
            <button onClick={() => chrome.runtime.openOptionsPage()}
              className="rounded bg-red-700 px-2 py-1 text-xs font-medium hover:bg-red-600">
              Open Settings
            </button>
          )}
        </div>
      )}

      {s.status === "idle" ? (
        <p className="text-xs opacity-60">
          Select code in any editor on the page, then click Fix / Improve / Audit / Debug.
        </p>
      ) : (
        <>
          <nav className="flex gap-1 text-xs">
            {(["output", "diff", "original"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded px-2 py-1 ${
                  tab === t ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
                }`}>
                {t}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-h-0 overflow-auto rounded border border-neutral-800 bg-neutral-900">
            {tab === "output" && (
              <pre className="p-2 font-mono text-xs leading-snug whitespace-pre-wrap">
                {code || <span className="opacity-50">Waiting for output…</span>}
              </pre>
            )}
            {tab === "diff" && <DiffView original={s.original} suggested={code} />}
            {tab === "original" && (
              <pre className="p-2 font-mono text-xs leading-snug whitespace-pre-wrap text-neutral-300">
                {s.original}
              </pre>
            )}
          </div>

          {notes && (
            <div className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs">
              <div className="opacity-60 mb-1">Notes</div>
              <pre className="whitespace-pre-wrap leading-snug">{notes}</pre>
            </div>
          )}

          <div className="flex gap-2">
            {s.status === "streaming" ? (
              <button onClick={stop}
                className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium hover:bg-red-600">
                Stop
              </button>
            ) : (
              <button onClick={replace} disabled={s.status !== "done" || !code}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-emerald-500">
                Replace
              </button>
            )}
            <button onClick={copy} disabled={!code}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-40">
              Copy
            </button>
            <button onClick={retry}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              Retry
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function badgeCls(s: Status) {
  const base = "rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ";
  switch (s) {
    case "streaming": return base + "bg-blue-900/60 text-blue-200";
    case "done":      return base + "bg-emerald-900/60 text-emerald-200";
    case "error":     return base + "bg-red-900/60 text-red-200";
    default:          return base + "bg-neutral-800 text-neutral-400";
  }
}
