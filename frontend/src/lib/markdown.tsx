import { Fragment, ReactNode } from "react";

/**
 * Minimal safe markdown renderer for test-step content. Supports **bold**,
 * *italic*, `code`, [links](url), bullet lists (`- ` or `* `), ordered lists
 * (`1. `), and blank-line-separated paragraphs. Deliberately narrow so we
 * don't ship an external markdown parser just for this surface; we never
 * set innerHTML, so the output is XSS-safe by construction.
 */

type Inline = { kind: "inline"; text: string };
type Ul = { kind: "ul"; items: string[] };
type Ol = { kind: "ol"; items: string[] };
type Block = Inline | Ul | Ol;

function parseBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    if (buf.length > 0) blocks.push({ kind: "inline", text: buf.join("\n") });
    while (i < lines.length && lines[i].trim() === "") i += 1;
  }
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const raw: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) raw.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) raw.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3] !== undefined) raw.push(<em key={key++}>{match[3]}</em>);
    else if (match[4] !== undefined)
      raw.push(
        <code key={key++} className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[0.85em]">
          {match[4]}
        </code>,
      );
    else if (match[5] !== undefined && match[6] !== undefined)
      raw.push(
        <a key={key++} href={match[6]} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
          {match[5]}
        </a>,
      );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) raw.push(text.slice(lastIndex));
  // Preserve single newlines inside a paragraph as <br/>.
  const out: ReactNode[] = [];
  raw.forEach((n, idx) => {
    if (typeof n !== "string") {
      out.push(n);
      return;
    }
    const parts = n.split("\n");
    parts.forEach((p, pIdx) => {
      out.push(p);
      if (pIdx < parts.length - 1) out.push(<br key={`br-${idx}-${pIdx}`} />);
    });
  });
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  if (!source) return null;
  const blocks = parseBlocks(source);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.kind === "ul") {
          return (
            <ul key={i} className="list-disc pl-5 my-1">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={i} className="list-decimal pl-5 my-1">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="my-1 whitespace-pre-wrap">
            <Fragment>{renderInline(b.text)}</Fragment>
          </p>
        );
      })}
    </div>
  );
}
