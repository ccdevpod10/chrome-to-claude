import type { ConversationMessage } from "./messages";

const MAX_MESSAGES = 20;
const HISTORY_KEY = "conversation_history";

type HistoryMap = Record<string, ConversationMessage[]>;

// In-memory fallback for environments where chrome.storage.session is unavailable.
const memoryFallback = new Map<number, ConversationMessage[]>();

// Per-tabId write serialization queue to prevent race conditions in appendMessage.
const writeQueues = new Map<number, Promise<void>>();

function enqueueWrite(tabId: number, fn: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(tabId) ?? Promise.resolve();
  const next = prev.then(fn).catch((err) => {
    // Log but keep chain alive — writes are fire-and-forget
    console.warn("[conversation-store] write failed:", err);
  });
  writeQueues.set(tabId, next);
  // Cleanup: clear queue ref after settle to avoid memory leak
  next.finally(() => {
    if (writeQueues.get(tabId) === next) writeQueues.delete(tabId);
  });
  return next;
}

function hasSessionStorage(): boolean {
  return typeof chrome !== "undefined" &&
    typeof chrome.storage !== "undefined" &&
    typeof chrome.storage.session !== "undefined";
}

async function readMap(): Promise<HistoryMap> {
  if (!hasSessionStorage()) return {};
  const r = await chrome.storage.session.get(HISTORY_KEY);
  return (r[HISTORY_KEY] as HistoryMap | undefined) ?? {};
}

async function writeMap(map: HistoryMap): Promise<void> {
  if (!hasSessionStorage()) return;
  await chrome.storage.session.set({ [HISTORY_KEY]: map });
}

/** Get conversation history for a tab (empty array if none). */
export async function getHistory(tabId: number): Promise<ConversationMessage[]> {
  if (!hasSessionStorage()) {
    return memoryFallback.get(tabId) ?? [];
  }
  const map = await readMap();
  return map[String(tabId)] ?? [];
}

/** Append a message to the tab's conversation history. Trims oldest if > MAX_MESSAGES. */
export async function appendMessage(tabId: number, msg: ConversationMessage): Promise<void> {
  if (!hasSessionStorage()) {
    const current = memoryFallback.get(tabId) ?? [];
    current.push(msg);
    if (current.length > MAX_MESSAGES) {
      current.splice(0, current.length - MAX_MESSAGES);
    }
    memoryFallback.set(tabId, current);
    return;
  }

  // Serialize writes per tab to prevent race condition in read-modify-write
  return enqueueWrite(tabId, async () => {
    const map = await readMap();
    const key = String(tabId);
    const current = map[key] ?? [];
    current.push(msg);
    if (current.length > MAX_MESSAGES) {
      current.splice(0, current.length - MAX_MESSAGES);
    }
    map[key] = current;
    await writeMap(map);
  });
}

/** Clear all conversation history for a tab. */
export async function clearHistory(tabId: number): Promise<void> {
  if (!hasSessionStorage()) {
    memoryFallback.delete(tabId);
    return;
  }

  // Serialize writes per tab to prevent race condition
  return enqueueWrite(tabId, async () => {
    const map = await readMap();
    delete map[String(tabId)];
    await writeMap(map);
  });
}

/**
 * Get last N turns from history (each turn = 1 user + 1 assistant = 2 messages).
 * Default 6 turns = 12 messages.
 */
export function getLastN(history: ConversationMessage[], n = 6): ConversationMessage[] {
  const count = n * 2;
  return history.length > count ? history.slice(history.length - count) : history;
}
