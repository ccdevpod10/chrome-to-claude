import { EditorAdapter, SelectionInfo } from "./base";
import { reindent } from "../reindent";

export const textareaAdapter: EditorAdapter = {
  id: "textarea",
  matches: (el) =>
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && el.type === "text") ||
    (el instanceof HTMLElement && el.isContentEditable),

  getSelection(el): SelectionInfo | null {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start === end) return null;
      const text = el.value.slice(start, end);
      return { text, rect: el.getBoundingClientRect(), el, handle: { kind: "input", start, end, originalText: text } };
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    return {
      text: sel.toString(),
      rect: range.getBoundingClientRect(),
      el,
      handle: { kind: "ce", range: range.cloneRange(), originalText: sel.toString() },
    };
  },

  replaceSelection(info, newText) {
    const h = info.handle as { kind: string; start?: number; end?: number; range?: Range; originalText: string };
    const aligned = reindent(h.originalText, newText);
    if (h?.kind === "input") {
      const t = info.el as HTMLTextAreaElement;
      t.focus();
      t.setRangeText(aligned, h.start!, h.end!, "end");
      t.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    if (h?.kind === "ce" && h.range) {
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(h.range);
      h.range.deleteContents();
      h.range.insertNode(document.createTextNode(aligned));
      info.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: aligned }));
      return true;
    }
    return false;
  },

  getFileContent(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return Promise.resolve(el.value);
    }
    return Promise.resolve((el as HTMLElement).textContent ?? "");
  },
};
