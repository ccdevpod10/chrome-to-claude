// Legacy actions (kept for backward compatibility with existing callers)
type LegacyAction = "fix" | "improve" | "audit" | "debug";

// New action groups
// Review group: inspect code without producing a rewrite
type ReviewAction = "review" | "explain" | "find-bugs";
// Generate group: produce new code from a description or selection
type GenerateAction = "generate" | "write-tests" | "write-docs" | "scaffold";
// Debug group: diagnose and fix runtime/logic problems
type DebugAction = "debug-error" | "trace" | "fix";

export type Action = LegacyAction | ReviewAction | GenerateAction | DebugAction;

export interface Diagnostic { level: "error" | "warn" | "info"; message: string }

/** A single turn in a multi-turn conversation. */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/** File content sliced around the current selection (up to 60 lines each side). */
export interface FileContext {
  /** e.g. "auth.service.ts" */
  filename?: string;
  language?: string;
  /** Up to 60 lines of file content immediately before the selection */
  linesBefore: string;
  /** Up to 60 lines of file content immediately after the selection */
  linesAfter: string;
}

export interface AssistRequest {
  type: "ASSIST_REQUEST";
  id: string;
  action: Action;
  code: string;
  language?: string;
  /** Legacy flat context strings — still accepted for backward compat */
  contextBefore?: string;
  contextAfter?: string;
  url: string;
  tabId?: number;
  /** Pre-flight findings (e.g. JS dry-run for the debug action). */
  diagnostics?: Diagnostic[];
  /** Last N conversation turns to send as history context */
  history?: ConversationMessage[];
  /** Rich file context window around the selection */
  fileContext?: FileContext;
  /** Free-text instruction when there is no code selection (command-palette mode) */
  freeText?: string;
}

export interface AssistChunk { type: "ASSIST_CHUNK"; id: string; delta: string }
export interface AssistDone  { type: "ASSIST_DONE";  id: string; full: string }
export interface AssistError { type: "ASSIST_ERROR"; id: string; error: string; code?: string }
export interface AssistStart { type: "ASSIST_START"; id: string; original: string; action: Action; tabId: number }

export type SWMessage = AssistStart | AssistChunk | AssistDone | AssistError;

export interface ReplaceRequest { type: "REPLACE_SELECTION"; text: string }
export interface TriggerTooltip { type: "TRIGGER_TOOLTIP" }
export interface CancelRequest { type: "ASSIST_CANCEL"; id: string }
