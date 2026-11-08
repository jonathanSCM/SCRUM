import { Fragment } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/scrum/markdown";

function inline(nodes: Inline[]): React.ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "bold":
        return <strong key={i} className="font-semibold text-ink">{inline(n.c)}</strong>;
      case "em":
        return <em key={i}>{inline(n.c)}</em>;
      case "code":
        return <code key={i} className="rounded bg-paper-deep px-1 font-mono text-[0.85em] text-ink">{n.v}</code>;
      case "mention":
        return <span key={i} className="rounded bg-chip-tint px-1 font-semibold text-rust">{n.v}</span>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="font-medium text-rust underline underline-offset-2 hover:opacity-80">
            {inline(n.c)}
          </a>
        );
    }
  });
}

function block(b: Block, i: number): React.ReactNode {
  switch (b.t) {
    case "p":
      return <p key={i} className="whitespace-pre-wrap">{inline(b.c)}</p>;
    case "h":
      return <p key={i} className={b.level === 1 ? "font-display text-base font-extrabold text-ink" : "font-display text-sm font-bold text-ink"}>{inline(b.c)}</p>;
    case "ul":
      return <ul key={i} className="list-disc space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
    case "ol":
      return <ol key={i} className="list-decimal space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>;
    case "quote":
      return <blockquote key={i} className="border-l-4 border-line-strong pl-3 italic">{inline(b.c)}</blockquote>;
    case "pre":
      return <pre key={i} className="overflow-x-auto rounded-md bg-paper-deep p-2 font-mono text-xs text-ink">{b.v}</pre>;
  }
}

// Texto con markdown (títulos, listas, negrita, enlaces…) sin permitir HTML.
export default function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={`space-y-2 ${className ?? ""}`}>{parseMarkdown(text).map(block)}</div>;
}
