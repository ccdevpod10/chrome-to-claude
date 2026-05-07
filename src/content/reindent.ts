// Reindent text to match the base indentation of an original selection.
// Strips the common minimum indent from `incoming`, then prepends the
// original's first-line indent to lines 2..N. Line 0 is left as-is because
// Monaco's executeEdits inserts line 0 at the selection-start column.

export function reindent(original: string, incoming: string): string {
  if (!incoming) return incoming;
  const baseMatch = original.match(/^[ \t]*/);
  const baseIndent = baseMatch ? baseMatch[0] : "";

  const lines = incoming.replace(/\r\n/g, "\n").split("\n");
  // Common minimum indent across non-blank lines (lines 1+ — line 0 is unindented anchor).
  let minIndent = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const m = l.match(/^[ \t]*/);
    const indent = m ? m[0].length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (!isFinite(minIndent)) minIndent = 0;

  return lines
    .map((l, i) => {
      if (!l.trim()) return ""; // collapse trailing whitespace on blank lines
      const stripped = l.slice(Math.min(minIndent, l.length - l.trimStart().length));
      return i === 0 ? stripped : baseIndent + stripped;
    })
    .join("\n");
}
