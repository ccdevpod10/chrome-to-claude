import { EditorAdapter, SelectionInfo } from "./base";

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
      return { text, rect: el.getBoundingClientRect(), el, handle: { kind: "input", start, end } };
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    return {
      text: sel.toString(),
      rect: range.getBoundingClientRect(),
      el,
      handle: { kind: "ce", range: range.cloneRange() },
    };
  },

  replaceSelection(info, newText) {
    const h = info.handle as { kind: string; start?: number; end?: number; range?: Range };
    if (h?.kind === "input") {
      const t = info.el as HTMLTextAreaElement;
      t.focus();
      t.setRangeText(newText, h.start!, h.end!, "end");
      t.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    if (h?.kind === "ce" && h.range) {
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(h.range);
      h.range.deleteContents();
      h.range.insertNode(document.createTextNode(newText));
      info.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: newText }));
      return true;
    }
    return false;
  },
};
