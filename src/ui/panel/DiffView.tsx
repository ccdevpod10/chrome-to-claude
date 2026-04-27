import { useMemo } from "react";
import { diffLines } from "diff";

interface Props { original: string; suggested: string }

export default function DiffView({ original, suggested }: Props) {
  const parts = useMemo(() => diffLines(original, suggested), [original, suggested]);
  if (!suggested) return <pre className="p-2 text-xs opacity-50">Waiting for output…</pre>;

  const onlyEqual = parts.length === 1 && !parts[0].added && !parts[0].removed;
  if (onlyEqual) {
    return (
      <pre className="p-2 font-mono text-xs leading-snug whitespace-pre-wrap text-neutral-300">
        {suggested}
      </pre>
    );
  }

  return (
    <div className="font-mono text-xs leading-snug">
      {parts.map((p, i) => {
        const cls = p.added
          ? "bg-emerald-950/60 text-emerald-200"
          : p.removed
            ? "bg-red-950/60 text-red-200"
            : "text-neutral-300";
        const sigil = p.added ? "+ " : p.removed ? "- " : "  ";
        const lines = p.value.split("\n");
        if (lines.length && lines[lines.length - 1] === "") lines.pop();
        return (
          <pre key={i} className={`${cls} px-2 whitespace-pre-wrap`}>
            {lines.map((l) => sigil + l).join("\n")}
          </pre>
        );
      })}
    </div>
  );
}
