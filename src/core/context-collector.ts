/** Result of collecting file context around a selection. */
export interface CollectedContext {
  /** Up to 60 lines of file content immediately before the selection */
  linesBefore: string;
  /** Up to 60 lines of file content immediately after the selection */
  linesAfter: string;
  /** Human-readable filename derived from URL or page title */
  filename?: string;
}

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
export function collectFileContext(fileContent: string, selectedText: string): CollectedContext {
  if (!fileContent || !selectedText) {
    return { linesBefore: "", linesAfter: "" };
  }

  // Find the first occurrence of the selected text in the file.
  const selectionStart = fileContent.indexOf(selectedText);
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
 * Trim before/after strings so their combined length stays within MAX_CONTEXT_CHARS.
 * If both are within budget, they are returned unchanged.
 * If the total exceeds the budget, each side is reduced proportionally.
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
  // the far end of after (keep lines closest to selection).
  const trimmedBefore = before.length > beforeBudget
    ? before.slice(before.length - beforeBudget)
    : before;
  const trimmedAfter = after.length > afterBudget
    ? after.slice(0, afterBudget)
    : after;

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
  // We look for the segment after /blob/ or /raw/ or /tree/.
  const repoFileMatch = pathname.match(/\/(?:blob|raw|edit)\/[^/]+\/(.+)$/);
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
