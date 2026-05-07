import { useEffect, useRef, useState } from "react";
import type { SWMessage, Action, PaletteFire } from "../../core/messages";
import MessageThread, { ChatMessage } from "./MessageThread";
import FollowUpInput from "./FollowUpInput";
import { IconCog, IconSparkle } from "./Icons";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "panel" });
    portRef.current = port;

    const onMessage = (m: SWMessage) => {
      if (m.type === "ASSIST_START") {
        setActiveId(m.id);
        // Append user bubble + assistant bubble
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${m.id}`,
            role: "user",
            action: m.action,
            prompt: undefined,
            tabId: m.tabId,
            original: m.original,
          },
          {
            id: m.id,
            role: "assistant",
            streamed: "",
            status: "streaming",
            tabId: m.tabId,
            original: m.original,
          },
        ]);
      } else if (m.type === "ASSIST_CHUNK") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === m.id
              ? { ...msg, streamed: (msg.streamed ?? "") + m.delta }
              : msg
          )
        );
      } else if (m.type === "ASSIST_DONE") {
        setActiveId(null);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === m.id ? { ...msg, streamed: m.full, status: "done" } : msg
          )
        );
      } else if (m.type === "ASSIST_ERROR") {
        setActiveId(null);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === m.id
              ? { ...msg, status: "error", error: m.error }
              : msg
          )
        );
      }
    };

    port.onMessage.addListener(onMessage);
    return () => {
      port.disconnect();
    };
  }, []);

  const isStreaming = activeId !== null;

  const handleReplace = async (tabId: number, text: string) => {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "REPLACE_SELECTION", text });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setCopied((prev) => ({ ...prev, [id]: false })), 1200);
  };

  const handleRetry = (id: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg || !msg.tabId || msg.tabId < 0) return;
    if (!msg.original) return;
    // Re-send the same code and action via PALETTE_FIRE
    try {
      chrome.tabs.sendMessage(msg.tabId, {
        type: "PALETTE_FIRE",
        action: msg.action ?? "improve",
        freeText: msg.prompt,
      } satisfies PaletteFire);
    } catch {
      /* tab may be closed */
    }
  };

  const handleStop = (id: string) => {
    chrome.runtime.sendMessage({ type: "ASSIST_CANCEL", id }).catch(() => {});
  };

  const handleNewConversation = async () => {
    setMessages([]);
    setActiveId(null);
    setFilename(undefined);
    setLanguage(undefined);
    // Send CLEAR_HISTORY to whichever active tab we last knew about
    const lastMsg = [...messages].reverse().find((m) => m.tabId !== undefined && m.tabId >= 0);
    if (lastMsg?.tabId !== undefined && lastMsg.tabId >= 0) {
      chrome.runtime.sendMessage({ type: "CLEAR_HISTORY", tabId: lastMsg.tabId }).catch(() => {});
    }
  };

  const handleFollowUp = (action: Action, freeText?: string) => {
    // Get the last known tabId from messages
    const lastAssistant = [...messages].reverse().find(
      (m) => m.role === "assistant" && m.tabId !== undefined && m.tabId >= 0
    );
    const tabId = lastAssistant?.tabId;

    if (tabId !== undefined && tabId >= 0) {
      chrome.tabs.sendMessage(tabId, {
        type: "PALETTE_FIRE",
        action,
        freeText,
      }).catch(() => {});
    } else {
      // Fall back to querying the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs[0]?.id;
        if (id !== undefined) {
          chrome.tabs.sendMessage(id, {
            type: "PALETTE_FIRE",
            action,
            freeText,
          }).catch(() => {});
        }
      });
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <Header
        onNewConversation={handleNewConversation}
        onSettings={() => chrome.runtime.openOptionsPage()}
      />

      {(filename || language) && (
        <FileContextBadge filename={filename} language={language} />
      )}

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <MessageThread
            messages={messages}
            copied={copied}
            onReplace={handleReplace}
            onCopy={handleCopy}
            onRetry={handleRetry}
            onStop={handleStop}
          />
        </div>

        <FollowUpInput disabled={isStreaming} onSubmit={handleFollowUp} />
      </main>
    </div>
  );
}

function Header({
  onNewConversation,
  onSettings,
}: {
  onNewConversation: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
          <IconSparkle width={14} height={14} />
        </div>
        <div className="text-[13px] font-semibold tracking-tight">AI Dev Assistant</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onNewConversation}
          title="New conversation"
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg-elev)] text-neutral-300 hover:bg-[var(--bg-elev-2)] hover:text-white text-lg font-light"
        >
          +
        </button>
        <button
          onClick={onSettings}
          title="Settings"
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg-elev)] text-neutral-300 hover:bg-[var(--bg-elev-2)] hover:text-white"
        >
          <IconCog />
        </button>
      </div>
    </header>
  );
}

function FileContextBadge({
  filename,
  language,
}: {
  filename?: string;
  language?: string;
}) {
  return (
    <div className="file-context-badge">
      <span className="rounded bg-[var(--bg-elev-2)] px-1.5 py-0.5 font-code text-[10px]">
        {filename ?? language ?? "unknown"}
      </span>
      {filename && language && (
        <span className="text-[var(--text-faint)]">{language}</span>
      )}
    </div>
  );
}
