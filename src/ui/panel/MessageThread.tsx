import { useEffect, useRef } from "react";
import { extractCode } from "../../core/prompt-builder";
import type { Action } from "../../core/messages";
import CodeBlock from "./CodeBlock";
import Notes from "./Notes";
import { IconCheck, IconCopy, IconReplace, IconRetry, IconSparkle, IconStop } from "./Icons";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  // User message fields
  action?: Action;
  prompt?: string;
  // Assistant message fields
  streamed?: string;
  status?: "streaming" | "done" | "error";
  error?: string;
  // Context for replacement
  tabId?: number;
  original?: string;
}

const ACTION_LABEL: Record<Action, string> = {
  fix: "Fix", improve: "Improve", audit: "Audit", debug: "Debug",
  review: "Review", explain: "Explain", "find-bugs": "Find Bugs",
  generate: "Generate", "write-tests": "Write Tests", "write-docs": "Write Docs", scaffold: "Scaffold",
  "debug-error": "Debug Error", trace: "Trace",
};

interface MessageThreadProps {
  messages: ChatMessage[];
  copied: Record<string, boolean>;
  onReplace: (tabId: number, text: string) => void;
  onCopy: (id: string, text: string) => void;
  onRetry: (id: string) => void;
  onStop: (id: string) => void;
}

export default function MessageThread({
  messages,
  copied,
  onReplace,
  onCopy,
  onRetry,
  onStop,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string>("");

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id !== lastIdRef.current) {
      lastIdRef.current = last.id;
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  if (!messages.length) {
    return <EmptyState />;
  }

  return (
    <div className="chat-thread">
      {messages.map((msg) =>
        msg.role === "user" ? (
          <UserBubble key={msg.id} message={msg} />
        ) : (
          <AssistantBubble
            key={msg.id}
            message={msg}
            isCopied={!!copied[msg.id]}
            onReplace={onReplace}
            onCopy={onCopy}
            onRetry={onRetry}
            onStop={onStop}
          />
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  const label = message.prompt
    ?? (message.action ? ACTION_LABEL[message.action] : "Request");
  return (
    <div className="chat-bubble-user">
      <span className="font-medium">{label}</span>
    </div>
  );
}

function AssistantBubble({
  message,
  isCopied,
  onReplace,
  onCopy,
  onRetry,
  onStop,
}: {
  message: ChatMessage;
  isCopied: boolean;
  onReplace: (tabId: number, text: string) => void;
  onCopy: (id: string, text: string) => void;
  onRetry: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const { code, notes } = extractCode(message.streamed ?? "");
  const isStreaming = message.status === "streaming";
  const isDone = message.status === "done";
  const isError = message.status === "error";

  return (
    <div className="chat-bubble-ai animate-fade">
      {isError ? (
        <div className="flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
          <div className="flex items-start gap-2">
            <div className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-rose-500/20 font-bold text-[12px]">!</div>
            <div className="text-[12px] text-rose-200">{message.error ?? "An error occurred."}</div>
          </div>
          {onRetry && (
            <SmallButton
              variant="danger"
              onClick={() => onRetry(message.id)}
              icon={<IconRetry />}
            >
              Retry
            </SmallButton>
          )}
        </div>
      ) : (
        <>
          <div className="code-wrapper">
            <CodeBlock
              text={code || (isStreaming ? "" : "")}
              onReplace={
                isDone && message.tabId !== undefined && message.tabId >= 0
                  ? () => onReplace(message.tabId!, code)
                  : undefined
              }
            />
            {isStreaming && <div className="h-0.5 w-full shimmer" />}
          </div>

          {notes && (
            <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3 animate-fade">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-500">
                <IconSparkle width={12} height={12} />
                Notes
              </div>
              <Notes text={notes} />
            </div>
          )}

          <div className="code-actions mt-1">
            {isStreaming ? (
              <SmallButton
                variant="danger"
                onClick={() => onStop(message.id)}
                icon={<IconStop />}
              >
                Stop
              </SmallButton>
            ) : (
              <>
                {isDone && message.tabId !== undefined && message.tabId >= 0 && (
                  <SmallButton
                    variant="primary"
                    onClick={() => onReplace(message.tabId!, code)}
                    disabled={!code}
                    icon={<IconReplace />}
                  >
                    Replace
                  </SmallButton>
                )}
                <SmallButton
                  variant="ghost"
                  onClick={() => onCopy(message.id, code)}
                  disabled={!code}
                  icon={isCopied ? <IconCheck /> : <IconCopy />}
                >
                  {isCopied ? "Copied" : "Copy"}
                </SmallButton>
                <SmallButton
                  variant="ghost"
                  onClick={() => onRetry(message.id)}
                  icon={<IconRetry />}
                >
                  Retry
                </SmallButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SmallButton({
  variant,
  onClick,
  disabled,
  icon,
  children,
}: {
  variant: "primary" | "danger" | "ghost";
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = {
    primary: "bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-400 hover:to-indigo-500 shadow-sm shadow-indigo-900/40",
    danger: "bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-400 hover:to-rose-500 shadow-sm shadow-rose-900/40",
    ghost: "border border-[var(--border)] bg-[var(--bg-elev)] text-neutral-200 hover:bg-[var(--bg-elev-2)]",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {icon}
      {children}
    </button>
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
        ⌘ K
      </kbd>
    </div>
  );
}
