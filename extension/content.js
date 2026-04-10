// ─── Message handler (on-demand reads from the side panel) ───────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CONTEXT") {
    sendResponse({
      url: window.location.href,
      title: document.title,
      selected_text: window.getSelection()?.toString() || "",
    });
  }

  if (message.type === "GET_EDITOR_CONTENT") {
    sendResponse({ editor_content: getEditorSelection() });
  }
});

// ─── Auto-push selection changes to the side panel ───────────────────────

let _debounce = null;

document.addEventListener("selectionchange", () => {
  clearTimeout(_debounce);
  _debounce = setTimeout(() => {
    const text = getEditorSelection();
    if (text) {
      chrome.runtime.sendMessage({ type: "SELECTION_CHANGED", text }).catch(() => {});
    }
  }, 300);
});

/**
 * Try to extract the currently selected/highlighted text from whichever
 * web editor is present on the page.
 *
 * Detection order:
 *   1. Monaco (VS Code web, CodePen, StackBlitz, …)
 *   2. CodeMirror 6
 *   3. CodeMirror 5
 *   4. ACE editor
 *   5. Focused <textarea> or <input> selection
 *   6. window.getSelection() fallback (contenteditable, etc.)
 */
function getEditorSelection() {
  // 1. Monaco Editor
  try {
    if (window.monaco?.editor) {
      for (const editor of window.monaco.editor.getEditors()) {
        const sel = editor.getSelection();
        if (sel && !sel.isEmpty()) {
          const text = editor.getModel()?.getValueInRange(sel);
          if (text) return text;
        }
      }
    }
  } catch { /* not available */ }

  // 2. CodeMirror 6 — view is attached to the DOM element as .cmView.view
  try {
    const cm6 = document.querySelector(".cm-editor");
    if (cm6?.cmView?.view) {
      const view = cm6.cmView.view;
      const { from, to } = view.state.selection.main;
      if (from !== to) return view.state.sliceDoc(from, to);
    }
  } catch { /* not available */ }

  // 3. CodeMirror 5 — instance attached to the wrapper element as .CodeMirror
  try {
    const cm5 = document.querySelector(".CodeMirror");
    if (cm5?.CodeMirror) {
      const text = cm5.CodeMirror.getSelection();
      if (text) return text;
    }
  } catch { /* not available */ }

  // 4. ACE editor — instance attached to the DOM element as .env.editor
  try {
    const ace = document.querySelector(".ace_editor");
    if (ace?.env?.editor) {
      const text = ace.env.editor.getSelectedText();
      if (text) return text;
    }
  } catch { /* not available */ }

  // 5. Focused <textarea> or <input type="text"> with a text selection
  try {
    const el = document.activeElement;
    if (
      el &&
      (el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && el.type === "text")) &&
      el.selectionStart !== el.selectionEnd
    ) {
      return el.value.substring(el.selectionStart, el.selectionEnd);
    }
  } catch { /* not available */ }

  // 6. Generic selection fallback (contenteditable, plain text nodes, etc.)
  return window.getSelection()?.toString() || "";
}
