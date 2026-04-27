export interface SelectionInfo {
  text: string;
  rect: DOMRect;
  language?: string;
  el: Element;
  handle?: unknown;
}

export interface EditorAdapter {
  readonly id: string;
  matches(el: Element): boolean;
  getSelection(el: Element): Promise<SelectionInfo | null> | SelectionInfo | null;
  replaceSelection(info: SelectionInfo, newText: string): Promise<boolean> | boolean;
}
