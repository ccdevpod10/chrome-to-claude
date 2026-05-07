import type { FileContext } from "./messages";

/** Result of collecting file context around a selection. */
export type CollectedContext = FileContext;

/** Maximum lines to collect on each side of the selection. */
const MAX_LINES_EACH_SIDE = 60;

/**
 * Rough token estimate: 1 token ≈ 4 characters.
 * We cap total context (before + after combined) at ~3000 tokens → ~12 000 chars.
 */
const MAX_CONTEXT_CHARS = 12_000;

/**
 * Given the full file content and the selected text, extract up to 60 lines
 * before and 60 lines after the selection.
 *
 * If the combined context exceeds ~3000 estimated tokens (12 000 chars),
 * both sides are trimmed proportionally so the total stays within budget.
 */
export function collectFileContext(
  fileContent: string,
  selectedText: string,
  selectionOffset?: number,  // character offset into fileContent where selection starts
): CollectedContext {
  if (!fileContent || !selectedText) {
    return { linesBefore: "", linesAfter: "" };
  }

  // Use provided offset directly; fall back to indexOf only when not provided.
  const selectionStart = selectionOffset !== undefined
    ? selectionOffset
    : fileContent.indexOf(selectedText);
  if (selectionStart === -1) {
    // Selection not found in content — return empty context.
    return { linesBefore: "", linesAfter: "" };
  }
  const selectionEnd = selectionStart + selectedText.length;

  const contentBefore = fileContent.slice(0, selectionStart);
  const contentAfter = fileContent.slice(selectionEnd);

  // Split into lines and take the tail / head respectively.
  const linesBefore = contentBefore.split("\n").slice(-MAX_LINES_EACH_SIDE).join("\n");
  const linesAfter = contentAfter.split("\n").slice(0, MAX_LINES_EACH_SIDE).join("\n");

  // Token-budget enforcement: trim symmetrically if needed.
  const { trimmedBefore, trimmedAfter } = applyTokenBudget(linesBefore, linesAfter);

  return { linesBefore: trimmedBefore, linesAfter: trimmedAfter };
}

/**
 * Trim a string to at most maxChars characters by dropping whole lines from
 * the far end. When fromEnd is true, lines are dropped from the start (keeping
 * lines nearest to the end / closest to the selection for "before" context).
 * When fromEnd is false, lines are dropped from the end (keeping lines nearest
 * to the start / closest to the selection for "after" context).
 */
function trimToChars(text: string, maxChars: number, fromEnd: boolean): string {
  if (text.length <= maxChars) return text;
  const lines = text.split("\n");
  if (fromEnd) {
    // keep the end (lines closest to selection — used for "before" context)
    while (lines.join("\n").length > maxChars && lines.length > 0) lines.shift();
  } else {
    // keep the start (lines closest to selection — used for "after" context)
    while (lines.join("\n").length > maxChars && lines.length > 0) lines.pop();
  }
  return lines.join("\n");
}

/**
 * Trim before/after strings so their combined length stays within MAX_CONTEXT_CHARS.
 * If both are within budget, they are returned unchanged.
 * If the total exceeds the budget, each side is reduced proportionally.
 * Trimming is done on whole-line boundaries to avoid splitting mid-line.
 */
function applyTokenBudget(
  before: string,
  after: string,
): { trimmedBefore: string; trimmedAfter: string } {
  const total = before.length + after.length;
  if (total <= MAX_CONTEXT_CHARS) {
    return { trimmedBefore: before, trimmedAfter: after };
  }

  // Compute how much of the budget each side should get, proportional to its share.
  const beforeShare = before.length / total;
  const afterShare = after.length / total;

  const beforeBudget = Math.floor(MAX_CONTEXT_CHARS * beforeShare);
  const afterBudget = Math.floor(MAX_CONTEXT_CHARS * afterShare);

  // Trim from the far end of before (keep lines closest to selection) and
  // the far end of after (keep lines closest to selection), on whole-line boundaries.
  const trimmedBefore = trimToChars(before, beforeBudget, true);
  const trimmedAfter = trimToChars(after, afterBudget, false);

  return { trimmedBefore, trimmedAfter };
}

/**
 * Extract a human-readable filename from the current page URL.
 *
 * Rules (in order):
 * 1. GitHub file view: extract filename from the path (e.g. `/blob/main/src/foo.ts` → `foo.ts`).
 * 2. Any URL: use the last non-empty path segment if it looks like a file (has an extension).
 * 3. Otherwise: return `undefined` (caller may fall back to document title).
 */
export function extractFilename(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const pathname = parsed.pathname;

  // GitHub / GitLab / Bitbucket: paths like /owner/repo/blob/branch/path/to/file.ext
  // GitLab also uses /-/blob/branch/path/to/file.ext
  // We look for the segment after /blob/ or /raw/ or /edit/ or /-/blob/, etc.
  const repoFileMatch = pathname.match(/\/(?:-\/)?(?:blob|raw|edit)\/[^/]+\/(.+)$/);
  if (repoFileMatch) {
    // The remainder is the file path inside the repo — take the last segment.
    const segments = repoFileMatch[1].split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && hasExtension(last)) return last;
  }

  // Generic: last non-empty path segment that looks like a file.
  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (hasExtension(seg)) return seg;
  }

  return undefined;
}

/** Returns true if the string contains a dot that is not the first character,
 *  indicating it likely has a file extension. */
function hasExtension(name: string): boolean {
  const dotIdx = name.lastIndexOf(".");
  return dotIdx > 0 && dotIdx < name.length - 1;
}
