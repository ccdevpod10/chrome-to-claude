export type Action = "fix" | "improve" | "audit" | "debug";

export interface Diagnostic { level: "error" | "warn" | "info"; message: string }

export interface AssistRequest {
  type: "ASSIST_REQUEST";
  id: string;
  action: Action;
  code: string;
  language?: string;
  contextBefore?: string;
  contextAfter?: string;
  url: string;
  tabId?: number;
  /** Pre-flight findings (e.g. JS dry-run for the debug action). */
  diagnostics?: Diagnostic[];
}

export interface AssistChunk { type: "ASSIST_CHUNK"; id: string; delta: string }
export interface AssistDone  { type: "ASSIST_DONE";  id: string; full: string }
export interface AssistError { type: "ASSIST_ERROR"; id: string; error: string; code?: string }
export interface AssistStart { type: "ASSIST_START"; id: string; original: string; action: Action; tabId: number }

export type SWMessage = AssistStart | AssistChunk | AssistDone | AssistError;

export interface ReplaceRequest { type: "REPLACE_SELECTION"; text: string }
export interface TriggerTooltip { type: "TRIGGER_TOOLTIP" }
export interface CancelRequest { type: "ASSIST_CANCEL"; id: string }
