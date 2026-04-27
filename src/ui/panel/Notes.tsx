// Tiny markdown renderer: bold (**x**), inline code (`x`), bullet lists.
// Avoids pulling in a markdown lib. Safe by default — only generates spans/text nodes.
import { Fragment } from "react";

function renderInline(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const end = line.indexOf("**", i + 2);
      if (end > 0) {
        out.push(<strong key={key++} className="font-semibold text-neutral-100">{line.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (line[i] === "`") {
      const end = line.indexOf("`", i + 1);
      if (end > 0) {
        out.push(
          <code key={key++} className="font-code rounded bg-neutral-800/80 px-1 py-0.5 text-[11px] text-amber-300">
            {line.slice(i + 1, end)}
          </code>
        );
        i = end + 1;
        continue;
      }
    }
    let j = i;
    while (j < line.length && line[j] !== "*" && line[j] !== "`") j++;
    out.push(<Fragment key={key++}>{line.slice(i, j)}</Fragment>);
    i = j === i ? i + 1 : j;
  }
  return out;
}

export default function Notes({ text }: { text: string }) {
  if (!text.trim()) return null;
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let buf: string[] = [];
  let key = 0;
  const flushPara = () => {
    if (!buf.length) return;
    blocks.push(<p key={key++} className="text-[12px] leading-relaxed text-neutral-300">{renderInline(buf.join(" "))}</p>);
    buf = [];
  };
  let listBuf: string[] = [];
  const flushList = () => {
    if (!listBuf.length) return;
    blocks.push(
      <ul key={key++} className="list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-neutral-300 marker:text-neutral-500">
        {listBuf.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
      </ul>
    );
    listBuf = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (/^[-*]\s+/.test(l)) {
      flushPara();
      listBuf.push(l.replace(/^[-*]\s+/, ""));
    } else if (/^\d+\.\s+/.test(l)) {
      flushPara();
      listBuf.push(l.replace(/^\d+\.\s+/, ""));
    } else if (!l) {
      flushPara();
      flushList();
    } else {
      flushList();
      buf.push(l);
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}
