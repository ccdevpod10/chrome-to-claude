// Runs in the page's MAIN world. Bridges Monaco/CodeMirror access to the ISOLATED content script via window events.
// Protocol:
//   isolated → main:  CustomEvent("__ai_assist_req", { detail: { id, op, payload } })
//   main → isolated:  CustomEvent("__ai_assist_res", { detail: { id, ok, data, error } })
// Ops:
//   "monaco.getSelection" payload: { rootSelector?: string }   → { text, language, rect, editorIndex }
//   "monaco.replace"      payload: { editorIndex, text }       → { ok }
//   "cm6.getSelection"    payload: { rootSelector?: string }   → { text, rect, from, to, viewIndex }
//   "cm6.replace"         payload: { viewIndex, from, to, text } → { ok }

(() => {
  if ((window as unknown as { __aiAssistBridgeInstalled?: boolean }).__aiAssistBridgeInstalled) return;
  (window as unknown as { __aiAssistBridgeInstalled: boolean }).__aiAssistBridgeInstalled = true;

  type Editor = {
    getDomNode(): HTMLElement | null;
    getSelection(): unknown;
    getModel(): { getValueInRange(r: unknown): string; getLanguageId(): string; getValue(): string };
    executeEdits(src: string, edits: { range: unknown; text: string; forceMoveMarkers?: boolean }[]): boolean;
    focus(): void;
  };

  const send = (id: string, ok: boolean, data?: unknown, error?: string) =>
    window.dispatchEvent(new CustomEvent("__ai_assist_res", { detail: { id, ok, data, error } }));

  const monacoEditors = (): Editor[] => {
    const m = (window as unknown as { monaco?: { editor: { getEditors?: () => Editor[] } } }).monaco;
    return m?.editor?.getEditors?.() ?? [];
  };

  const findFocusedMonaco = (): { editor: Editor; index: number } | null => {
    const eds = monacoEditors();
    const ae = document.activeElement;
    for (let i = 0; i < eds.length; i++) {
      const node = eds[i].getDomNode();
      if (node && ae && node.contains(ae)) return { editor: eds[i], index: i };
    }
    if (eds.length === 1) return { editor: eds[0], index: 0 };
    return null;
  };

  // CodeMirror 6: walk DOM, find .cm-editor, read EditorView from cmView property.
  type CM6View = {
    state: { selection: { main: { from: number; to: number; empty: boolean } }; doc: { sliceString(a: number, b: number): string; toString(): string } };
    dispatch(tr: unknown): void;
    contentDOM: HTMLElement;
    dom: HTMLElement;
  };

  const collectCM6Views = (): CM6View[] => {
    const out: CM6View[] = [];
    document.querySelectorAll(".cm-editor").forEach((el) => {
      const v = (el as unknown as { _cmView?: CM6View; cmView?: { view?: CM6View } });
      const view = v._cmView ?? v.cmView?.view;
      if (view) out.push(view);
    });
    return out;
  };

  window.addEventListener("__ai_assist_req", (ev: Event) => {
    const e = ev as CustomEvent<{ id: string; op: string; payload?: Record<string, unknown> }>;
    const { id, op, payload } = e.detail;
    try {
      if (op === "monaco.getSelection") {
        const f = findFocusedMonaco();
        if (!f) return send(id, true, null);
        const sel = f.editor.getSelection() as {
          startLineNumber: number; startColumn: number;
          endLineNumber: number; endColumn: number;
        } | null;
        if (!sel) return send(id, true, null);
        const text = f.editor.getModel().getValueInRange(sel);
        if (!text) return send(id, true, null);
        const node = f.editor.getDomNode()!;
        const r = node.getBoundingClientRect();
        return send(id, true, {
          text,
          language: f.editor.getModel().getLanguageId(),
          rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.x, y: r.y },
          editorIndex: f.index,
          // Snapshot the range so replace can target the original selection
          // even after focus has moved into our popup (which collapses cursor).
          range: {
            startLineNumber: sel.startLineNumber,
            startColumn: sel.startColumn,
            endLineNumber: sel.endLineNumber,
            endColumn: sel.endColumn,
          },
        });
      }

      if (op === "monaco.replace") {
        const { editorIndex, text, range } = payload as {
          editorIndex: number; text: string;
          range?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
        };
        const ed = monacoEditors()[editorIndex];
        if (!ed) return send(id, false, null, "editor gone");
        const model = ed.getModel() as unknown as {
          applyEdits(edits: { range: unknown; text: string; forceMoveMarkers?: boolean }[]): unknown[];
          getLineCount(): number;
          getLineMaxColumn(line: number): number;
        };
        // Use the captured range; fall back to current selection only if absent.
        const targetRange = range ?? (ed.getSelection() as unknown);
        if (!targetRange) return send(id, false, null, "no target range");
        // model.applyEdits is a pure model op — no auto-indent, no formatter.
        // executeEdits would route through the editor and (in some hosts) trigger
        // autoIndent: 'full' which compounds indentation per inserted newline.
        try {
          model.applyEdits([{ range: targetRange, text, forceMoveMarkers: true }]);
          // Place cursor at end of inserted text.
          const lines = text.split("\n");
          const r = targetRange as { startLineNumber: number; startColumn: number };
          const endLine = r.startLineNumber + lines.length - 1;
          const endCol = lines.length === 1
            ? r.startColumn + lines[0].length
            : lines[lines.length - 1].length + 1;
          (ed as unknown as { setSelection: (s: object) => void }).setSelection({
            startLineNumber: endLine, startColumn: endCol,
            endLineNumber: endLine, endColumn: endCol,
          });
          ed.focus();
          return send(id, true, { ok: true });
        } catch (e) {
          return send(id, false, null, (e as Error)?.message ?? String(e));
        }
      }

      if (op === "cm6.getSelection") {
        const views = collectCM6Views();
        for (let i = 0; i < views.length; i++) {
          const v = views[i];
          const r = v.state.selection.main;
          if (r.empty) continue;
          const text = v.state.doc.sliceString(r.from, r.to);
          const rect = v.dom.getBoundingClientRect();
          return send(id, true, {
            text,
            from: r.from,
            to: r.to,
            viewIndex: i,
            rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, x: rect.x, y: rect.y },
          });
        }
        return send(id, true, null);
      }

      if (op === "cm6.replace") {
        const { viewIndex, from, to, text } = payload as { viewIndex: number; from: number; to: number; text: string };
        const v = collectCM6Views()[viewIndex];
        if (!v) return send(id, false, null, "view gone");
        v.dispatch({ changes: { from, to, insert: text } });
        return send(id, true, { ok: true });
      }

      if (op === "monaco.getFileContent") {
        const f = findFocusedMonaco();
        if (!f) return send(id, true, null);
        const content = f.editor.getModel().getValue();
        return send(id, true, { content });
      }

      if (op === "cm6.getFileContent") {
        const views = collectCM6Views();
        for (const v of views) {
          const content = v.state.doc.toString();
          if (content) return send(id, true, { content });
        }
        return send(id, true, null);
      }

      send(id, false, null, "unknown op: " + op);
    } catch (err) {
      send(id, false, null, (err as Error)?.message ?? String(err));
    }
  });
})();
