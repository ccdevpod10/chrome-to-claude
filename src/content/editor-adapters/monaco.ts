import { EditorAdapter } from "./base";
import { bridgeCall } from "../bridge";
import { reindent } from "../reindent";

interface RectLike { top: number; left: number; right: number; bottom: number; width: number; height: number; x: number; y: number }
interface MonacoRange { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
interface MonacoSelData { text: string; language: string; rect: RectLike; editorIndex: number; range: MonacoRange }

export const monacoAdapter: EditorAdapter = {
  id: "monaco",
  matches: (el) => !!el.closest(".monaco-editor"),

  async getSelection(el) {
    const root = el.closest(".monaco-editor") as HTMLElement | null;
    if (!root) return null;
    const data = await bridgeCall<MonacoSelData>("monaco.getSelection");
    if (!data || !data.text) return null;
    const rect = data.rect as unknown as DOMRect;
    return {
      text: data.text,
      language: data.language,
      rect,
      el: root,
      handle: { editorIndex: data.editorIndex, range: data.range, originalText: data.text },
    };
  },

  async replaceSelection(info, newText) {
    const h = info.handle as { editorIndex: number; range: MonacoRange; originalText: string };
    // Strip model's column-0 indent and re-prefix with the original selection's
    // base indent. Without this, deeply-nested selections receive code that
    // sits flush against the gutter.
    const aligned = reindent(h.originalText, newText);
    const r = await bridgeCall<{ ok: boolean }>(
      "monaco.replace",
      { editorIndex: h.editorIndex, range: h.range, text: aligned },
      1500,
    );
    return !!r?.ok;
  },

  async getFileContent(_el) {
    const data = await bridgeCall<{ content: string }>("monaco.getFileContent", {}, 500);
    return data?.content ?? null;
  },
};
