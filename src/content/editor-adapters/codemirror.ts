import { EditorAdapter, SelectionInfo } from "./base";
import { bridgeCall } from "../bridge";
import { reindent } from "../reindent";

interface RectLike { top: number; left: number; right: number; bottom: number; width: number; height: number; x: number; y: number }
interface CM6SelData { text: string; from: number; to: number; viewIndex: number; rect: RectLike }

export const codemirrorAdapter: EditorAdapter = {
  id: "codemirror",
  matches: (el) => !!el.closest(".cm-editor") || !!el.closest(".CodeMirror"),

  async getSelection(el): Promise<SelectionInfo | null> {
    const cm6Root = el.closest(".cm-editor") as HTMLElement | null;
    if (cm6Root) {
      const data = await bridgeCall<CM6SelData>("cm6.getSelection");
      if (!data || !data.text) return null;
      return {
        text: data.text,
        rect: data.rect as unknown as DOMRect,
        el: cm6Root,
        handle: { kind: "cm6", viewIndex: data.viewIndex, from: data.from, to: data.to, originalText: data.text },
      };
    }
    // CM5 fallback via browser selection
    const cm5Root = el.closest(".CodeMirror") as HTMLElement | null;
    const sel = window.getSelection();
    if (!cm5Root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
    return {
      text: sel.toString(),
      rect: sel.getRangeAt(0).getBoundingClientRect(),
      el: cm5Root,
      handle: { kind: "cm5", originalText: sel.toString() },
    };
  },

  async replaceSelection(info, newText) {
    const h = info.handle as { kind: string; viewIndex?: number; from?: number; to?: number; originalText: string };
    const aligned = reindent(h.originalText, newText);
    if (h.kind === "cm6") {
      const r = await bridgeCall<{ ok: boolean }>("cm6.replace", { viewIndex: h.viewIndex, from: h.from, to: h.to, text: aligned }, 1000);
      return !!r?.ok;
    }
    document.execCommand("insertText", false, aligned);
    return true;
  },

  async getFileContent(el) {
    if (el.closest(".cm-editor")) {
      const data = await bridgeCall<{ content: string }>("cm6.getFileContent");
      return data?.content ?? null;
    }
    // CM5 attaches the editor instance as `.CodeMirror` directly on the wrapper div.
    const wrapper = el.closest(".CodeMirror");
    const cm5 = wrapper
      ? (wrapper as unknown as { CodeMirror?: { getValue(): string } }).CodeMirror
      : undefined;
    return Promise.resolve(cm5?.getValue() ?? null);
  },
};
