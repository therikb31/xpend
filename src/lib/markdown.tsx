// Tiny markdown renderer for AI answers — headings, bold/italic, inline
// code, fences, lists, links. React nodes (never innerHTML), URLs limited
// to http(s). Deliberately small: no tables, no images, no raw HTML.

import type { ReactNode } from "react";

function inline(src: string, base: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s)<]+)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const key = base + "." + k++;
    const [tok, code, bold, ital, link, bare] = m;
    void tok;
    last = m.index + m[0].length;
    if (code) {
      out.push(
        <code key={key}>{code.slice(1, -1)}</code>
      );
    } else if (bold) {
      out.push(<strong key={key}>{inline(bold.slice(2, -2), key)}</strong>);
    } else if (ital) {
      out.push(<em key={key}>{inline(ital.slice(1, -1), key)}</em>);
    } else if (link) {
      const i = link.lastIndexOf("](");
      const label = link.slice(1, i);
      const url = link.slice(i + 2, -1);
      out.push(
        <a key={key} href={url} target="_blank" rel="noopener noreferrer">
          {inline(label, key)}
        </a>
      );
    } else if (bare) {
      out.push(
        <a key={key} href={bare} target="_blank" rel="noopener noreferrer">
          {bare}
        </a>
      );
    }
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const key = "p" + k++;
    const nodes: ReactNode[] = [];
    para.forEach((ln, j) => {
      if (j > 0) nodes.push(<br key={key + "b" + j} />);
      inline(ln, key + "l" + j).forEach((n, q) =>
        nodes.push(<span key={key + "l" + j + "n" + q}>{n}</span>)
      );
    });
    blocks.push(<p key={key}>{nodes}</p>);
    para.length = 0;
  };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\s*$/.test(ln)) {
      flushPara();
      i++;
      continue;
    }
    if (/^```/.test(ln)) {
      flushPara();
      const key = "f" + k++;
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln);
    if (h) {
      flushPara();
      const lvl = h[1].length;
      const key = "h" + k++;
      const kids = inline(h[2], key);
      blocks.push(
        lvl <= 2 ? <h4 key={key}>{kids}</h4> : <strong key={key}>{kids}</strong>
      );
      i++;
      continue;
    }
    if (/^\s*([-*])\s+/.test(ln)) {
      flushPara();
      const key = "u" + k++;
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*])\s+/.test(lines[i])) {
        const t = lines[i].replace(/^\s*([-*])\s+/, "");
        items.push(<li key={key + "i" + items.length}>{inline(t, key + "i" + items.length)}</li>);
        i++;
      }
      blocks.push(<ul key={key}>{items}</ul>);
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(ln);
    if (ol) {
      flushPara();
      const key = "o" + k++;
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const mm = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]);
        if (!mm) break;
        items.push(<li key={key + "i" + items.length}>{inline(mm[1], key + "i" + items.length)}</li>);
        i++;
      }
      blocks.push(<ol key={key}>{items}</ol>);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(ln)) {
      flushPara();
      blocks.push(<hr key={"r" + k++} />);
      i++;
      continue;
    }
    para.push(ln);
    i++;
  }
  flushPara();
  return <div className="md">{blocks}</div>;
}
