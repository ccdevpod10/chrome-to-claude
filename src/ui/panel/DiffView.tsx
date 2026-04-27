import { useMemo } from "react";
import { diffLines } from "diff";

interface Props { original: string; suggested: string }

export default function DiffView({ original, suggested }: Props) {
  const rows = useMemo(() => {
    if (!suggested) return [];
    const parts = diffLines(original, suggested);
    const out: { sigil: " " | "+" | "-"; line: string }[] = [];
    for (const p of parts) {
      const lines = p.value.split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      const sigil: " " | "+" | "-" = p.added ? "+" : p.removed ? "-" : " ";
      for (const l of lines) out.push({ sigil, line: l });
    }
    return out;
  }, [original, suggested]);

  if (!suggested) return <div className="p-3 text-[12px] text-neutral-500 italic">Waiting for output…</div>;
  if (!rows.length) return <div className="p-3 text-[12px] text-neutral-500 italic">No differences.</div>;

  return (
    <div className="font-code text-[12px] leading-[1.55]">
      {rows.map((r, i) => {
        const cls =
          r.sigil === "+" ? "bg-emerald-500/10 text-emerald-200 border-l-2 border-emerald-500/60"
          : r.sigil === "-" ? "bg-rose-500/10 text-rose-200 border-l-2 border-rose-500/60"
          : "text-neutral-300 border-l-2 border-transparent";
        return (
          <div key={i} className={`flex ${cls}`}>
            <span className="w-6 select-none px-2 text-center text-[11px] text-neutral-500">{r.sigil}</span>
            <span className="flex-1 whitespace-pre py-0.5 pr-3">{r.line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
