// Code viewer: monospace, line numbers, no wrap, horizontal scroll.
import { useMemo } from "react";

export default function CodeBlock({
  text,
  dim = false,
  onReplace,
}: {
  text: string;
  dim?: boolean;
  onReplace?: () => void;
}) {
  const lines = useMemo(() => (text.length ? text.split("\n") : []), [text]);
  if (!lines.length) {
    return <div className="p-3 text-[12px] text-neutral-500 italic">Waiting for output…</div>;
  }
  return (
    <div className="font-code text-[12px] leading-[1.55] relative group">
      <pre className="m-0 grid" style={{ gridTemplateColumns: "auto 1fr" }}>
        {lines.map((l, i) => (
          <div key={i} className="contents">
            <span className="select-none border-r border-neutral-800/80 px-2 py-0.5 text-right text-neutral-600 tabular-nums">
              {i + 1}
            </span>
            <span className={`px-3 py-0.5 whitespace-pre ${dim ? "text-neutral-400" : "text-neutral-100"}`}>
              {l || " "}
            </span>
          </div>
        ))}
      </pre>
      {onReplace && (
        <button
          onClick={onReplace}
          title="Replace selection in editor"
          aria-label="Replace selection in editor"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] px-2 py-1 text-[11px] font-medium text-neutral-200 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:text-indigo-300"
        >
          Replace
        </button>
      )}
    </div>
  );
}
