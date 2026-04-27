// Code viewer: monospace, line numbers, no wrap, horizontal scroll.
import { useMemo } from "react";

export default function CodeBlock({ text, dim = false }: { text: string; dim?: boolean }) {
  const lines = useMemo(() => (text.length ? text.split("\n") : []), [text]);
  if (!lines.length) {
    return <div className="p-3 text-[12px] text-neutral-500 italic">Waiting for output…</div>;
  }
  return (
    <div className="font-code text-[12px] leading-[1.55]">
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
    </div>
  );
}
