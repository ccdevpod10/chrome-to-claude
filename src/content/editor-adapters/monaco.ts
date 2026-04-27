import { EditorAdapter } from "./base";
import { bridgeCall } from "../bridge";

interface RectLike { top: number; left: number; right: number; bottom: number; width: number; height: number; x: number; y: number }
interface MonacoSelData { text: string; language: string; rect: RectLike; editorIndex: number }

export const monacoAdapter: EditorAdapter = {
  id: "monaco",
  matches: (el) => !!el.closest(".monaco-editor"),

  async getSelection(el) {
    const root = el.closest(".monaco-editor") as HTMLElement | null;
    if (!root) return null;
    const data = await bridgeCall<MonacoSelData>("monaco.getSelection");
    if (!data || !data.text) return null;
    const rect = data.rect as unknown as DOMRect; // structurally compatible
    return {
      text: data.text,
      language: data.language,
      rect,
      el: root,
      handle: { editorIndex: data.editorIndex },
    };
  },

  async replaceSelection(info, newText) {
    const h = info.handle as { editorIndex: number };
    const r = await bridgeCall<{ ok: boolean }>("monaco.replace", { editorIndex: h.editorIndex, text: newText }, 1000);
    return !!r?.ok;
  },
};
