import { useEffect, useMemo, useRef, useState } from "react";
import { extractCode } from "../../core/prompt-builder";
import type { SWMessage, Action } from "../../core/messages";
import DiffView from "./DiffView";
import CodeBlock from "./CodeBlock";
import Notes from "./Notes";
import {
  IconCheck, IconCog, IconCopy, IconReplace, IconRetry, IconSparkle, IconStop,
} from "./Icons";

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
  id: "", action: "improve", original: "", streamed: "", status: "idle", tabId: -1,
};

const ACTION_LABEL: Record<Action, string> = {
  fix: "Fix", improve: "Improve", audit: "Audit", debug: "Debug",
  review: "Review", explain: "Explain", "find-bugs": "Find Bugs",
  generate: "Generate", "write-tests": "Write Tests", "write-docs": "Write Docs", scaffold: "Scaffold",
  "debug-error": "Debug Error", trace: "Trace",
};

export default function App() {
  const [s, setS] = useState<SessionState>(EMPTY);
  const [tab, setTab] = useState<Tab>("output");
  const [copied, setCopied] = useState(false);
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
    try { await chrome.tabs.sendMessage(s.tabId, { type: "REPLACE_SELECTION", text: code }); }
    catch (e) { console.error(e); }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const retry = () => {
    if (s.tabId < 0) return;
    chrome.tabs.sendMessage(s.tabId, { type: "TRIGGER_TOOLTIP" }).catch(() => {});
  };
  const stop = () => {
    if (s.id) chrome.runtime.sendMessage({ type: "ASSIST_CANCEL", id: s.id }).catch(() => {});
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <Header status={s.status} action={s.action} />

      <main className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3">
        {s.status === "error" && <ErrorBanner error={s.error ?? ""} />}

        {s.status === "idle" ? (
          <EmptyState />
        ) : (
          <>
            <Tabs tab={tab} setTab={setTab} hasOriginal={!!s.original} />

            <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] overflow-hidden animate-fade">
              <div className="flex-1 overflow-auto">
                {tab === "output" && <CodeBlock text={code} />}
                {tab === "diff" && <DiffView original={s.original} suggested={code} />}
                {tab === "original" && <CodeBlock text={s.original} dim />}
              </div>
              {s.status === "streaming" && <StreamBar />}
            </section>

            {notes && (
              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3 animate-fade">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-500">
                  <IconSparkle width={12} height={12} />
                  Notes
                </div>
                <Notes text={notes} />
              </section>
            )}

            <ActionBar
              status={s.status}
              hasCode={!!code}
              copied={copied}
              onReplace={replace}
              onCopy={copy}
              onRetry={retry}
              onStop={stop}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Header({ status, action }: { status: Status; action: Action }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
          <IconSparkle width={14} height={14} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">AI Code Assistant</div>
          <div className="text-[10.5px] text-neutral-500">
            {status === "idle" ? "Ready" : ACTION_LABEL[action]}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <StatusPill status={status} />
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          title="Settings"
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg-elev)] text-neutral-300 hover:bg-[var(--bg-elev-2)] hover:text-white"
        >
          <IconCog />
        </button>
      </div>
    </header>
  );
}

function StatusPill({ status }: { status: Status }) {
  const cfg = {
    idle:      { dot: "bg-neutral-500",  bg: "bg-neutral-800/60",  text: "text-neutral-400", label: "Idle" },
    streaming: { dot: "bg-indigo-400",   bg: "bg-indigo-500/15",   text: "text-indigo-300",  label: "Streaming" },
    done:      { dot: "bg-emerald-400",  bg: "bg-emerald-500/15",  text: "text-emerald-300", label: "Done" },
    error:     { dot: "bg-rose-400",     bg: "bg-rose-500/15",     text: "text-rose-300",    label: "Error" },
  }[status];
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${status === "streaming" ? "dot-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

function Tabs({ tab, setTab, hasOriginal }: { tab: Tab; setTab: (t: Tab) => void; hasOriginal: boolean }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "output",   label: "Output" },
    { id: "diff",     label: "Diff" },
    ...(hasOriginal ? [{ id: "original" as Tab, label: "Original" }] : []),
  ];
  return (
    <div className="mt-3 inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
            tab === t.id
              ? "bg-[var(--bg-elev-2)] text-white shadow-[0_0_0_1px_var(--border-strong)]"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function StreamBar() {
  return <div className="h-0.5 w-full shimmer" />;
}

function ErrorBanner({ error }: { error: string }) {
  const wantSettings = /missing api key|no provider/i.test(error);
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-200 animate-fade">
      <div className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-rose-500/20">!</div>
      <div className="flex-1 space-y-2">
        <div className="leading-relaxed">{error}</div>
        {wantSettings && (
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="rounded-md bg-rose-500/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
          >
            Open Settings
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elev)]/40 p-8 text-center animate-fade">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-300">
        <IconSparkle width={20} height={20} />
      </div>
      <div className="space-y-1">
        <div className="text-[13px] font-semibold">Ready to assist</div>
        <p className="max-w-[260px] text-[12px] leading-relaxed text-neutral-400">
          Select code in any editor on the page, then choose <b className="text-neutral-200">Fix</b>,{" "}
          <b className="text-neutral-200">Improve</b>, <b className="text-neutral-200">Audit</b>, or{" "}
          <b className="text-neutral-200">Debug</b> from the floating tooltip.
        </p>
      </div>
      <kbd className="mt-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] px-2 py-1 font-code text-[10.5px] text-neutral-300">
        ⌘ ⇧ A
      </kbd>
    </div>
  );
}

function ActionBar(props: {
  status: Status; hasCode: boolean; copied: boolean;
  onReplace: () => void; onCopy: () => void; onRetry: () => void; onStop: () => void;
}) {
  const { status, hasCode, copied, onReplace, onCopy, onRetry, onStop } = props;
  return (
    <div className="sticky bottom-0 -mx-3 -mb-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)]/95 px-3 py-2.5 backdrop-blur">
      {status === "streaming" ? (
        <Button variant="danger" onClick={onStop} icon={<IconStop />}>Stop</Button>
      ) : (
        <Button variant="primary" onClick={onReplace} disabled={status !== "done" || !hasCode} icon={<IconReplace />}>
          Replace
        </Button>
      )}
      <Button variant="ghost" onClick={onCopy} disabled={!hasCode} icon={copied ? <IconCheck /> : <IconCopy />}>
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button variant="ghost" onClick={onRetry} icon={<IconRetry />}>Retry</Button>
    </div>
  );
}

function Button({
  variant, onClick, disabled, icon, children,
}: {
  variant: "primary" | "danger" | "ghost";
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = {
    primary: "bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-400 hover:to-indigo-500 shadow-sm shadow-indigo-900/40",
    danger:  "bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-400 hover:to-rose-500 shadow-sm shadow-rose-900/40",
    ghost:   "border border-[var(--border)] bg-[var(--bg-elev)] text-neutral-200 hover:bg-[var(--bg-elev-2)]",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {icon}
      {children}
    </button>
  );
}
