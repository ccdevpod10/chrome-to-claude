import { EditorAdapter, SelectionInfo } from "./editor-adapters/base";
import { monacoAdapter } from "./editor-adapters/monaco";
import { codemirrorAdapter } from "./editor-adapters/codemirror";
import { textareaAdapter } from "./editor-adapters/textarea";

const adapters: EditorAdapter[] = [monacoAdapter, codemirrorAdapter, textareaAdapter];

export interface DetectedSelection {
  adapter: EditorAdapter;
  info: SelectionInfo;
}

function candidateElements(): Element[] {
  const out: Element[] = [];
  const ae = document.activeElement;
  if (ae) out.push(ae);
  // If focus is on body/document, scan the whole DOM for editor roots.
  if (!ae || ae === document.body || ae === document.documentElement) {
    document.querySelectorAll(".monaco-editor, .cm-editor, .CodeMirror, textarea").forEach((el) => out.push(el));
  }
  return out;
}

export async function detect(target?: Element | null): Promise<DetectedSelection | null> {
  const targets = target ? [target] : candidateElements();
  for (const el of targets) {
    for (const a of adapters) {
      if (!a.matches(el)) continue;
      const info = await a.getSelection(el);
      if (info && info.text.trim().length >= 2) return { adapter: a, info };
    }
  }
  return null;
}
