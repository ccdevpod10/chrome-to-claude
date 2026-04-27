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
    getModel(): { getValueInRange(r: unknown): string; getLanguageId(): string };
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
    state: { selection: { main: { from: number; to: number; empty: boolean } }; doc: { sliceString(a: number, b: number): string } };
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
        const sel = f.editor.getSelection();
        const text = f.editor.getModel().getValueInRange(sel);
        if (!text) return send(id, true, null);
        const node = f.editor.getDomNode()!;
        const r = node.getBoundingClientRect();
        return send(id, true, {
          text,
          language: f.editor.getModel().getLanguageId(),
          rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.x, y: r.y },
          editorIndex: f.index,
        });
      }

      if (op === "monaco.replace") {
        const { editorIndex, text } = payload as { editorIndex: number; text: string };
        const ed = monacoEditors()[editorIndex];
        if (!ed) return send(id, false, null, "editor gone");
        ed.focus();
        const ok = ed.executeEdits("ai-assist", [{ range: ed.getSelection(), text, forceMoveMarkers: true }]);
        return send(id, true, { ok });
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

      send(id, false, null, "unknown op: " + op);
    } catch (err) {
      send(id, false, null, (err as Error)?.message ?? String(err));
    }
  });
})();
