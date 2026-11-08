// Markdown mínimo y SEGURO (sin HTML): se convierte a un árbol de nodos que el navegador dibuja con React.
// Soporta: títulos (#, ##, ###), listas con - o 1., citas (>), bloques ``` , **negrita**, *cursiva*, `código`,
// [texto](https://…) y enlaces sueltos. Solo se permiten enlaces http, https y mailto.

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "mention"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "pre"; v: string };

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  return /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(href) ? href : null;
}

const INLINE = /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\s]+)\))|(https?:\/\/[^\s<>"')\]]+[^\s<>"').,;:!?\]])|((?<=^|\s)@[\p{L}\p{N}_]+)/gu;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index!;
    if (i > last) out.push({ t: "text", v: text.slice(last, i) });
    if (m[1]) out.push({ t: "bold", c: parseInline(m[2]) });
    else if (m[3]) out.push({ t: "em", c: parseInline(m[4]) });
    else if (m[5]) out.push({ t: "code", v: m[6] });
    else if (m[7]) {
      const href = safeHref(m[9]);
      out.push(href ? { t: "link", href, c: parseInline(m[8]) } : { t: "text", v: m[0] });
    } else if (m[11]) {
      out.push({ t: "mention", v: m[11] });
    } else if (m[10]) {
      const href = safeHref(m[10]);
      out.push(href ? { t: "link", href, c: [{ t: "text", v: m[10] }] } : { t: "text", v: m[0] });
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join("\n")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      blocks.push({ t: "pre", v: code.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flush(); blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, c: parseInline(h[2]) }); continue; }
    if (/^>\s?/.test(line)) { flush(); blocks.push({ t: "quote", c: parseInline(line.replace(/^>\s?/, "")) }); continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = kind === "ul" ? lines[i].match(/^\s*[-*]\s+(.*)$/) : lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      i--;
      blocks.push({ t: kind, items });
      continue;
    }
    if (line.trim() === "") { flush(); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}
