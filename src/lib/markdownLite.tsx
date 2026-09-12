// Tiny markdown-lite renderer (bold, links, bullet lists).
//
// Deliberately not a full markdown library — assistants are instructed to use
// only these constructs, so a small hand-rolled parser keeps the bundle light
// and avoids an extra dependency for a handful of tags. Shared by the ChatBot
// widget and the OpenAI Code Center so both chat surfaces render identically.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter((p) => p !== '');
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={`${keyPrefix}-b-${i}`}>{bold[1]}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const className = 'text-blue-600 dark:text-blue-400 underline decoration-blue-300 hover:text-blue-800 font-medium';
      return href.startsWith('/') ? (
        <Link key={`${keyPrefix}-l-${i}`} to={href} className={className}>{label}</Link>
      ) : (
        <a key={`${keyPrefix}-l-${i}`} href={href} target="_blank" rel="noopener noreferrer" className={className}>{label}</a>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
  });
}

export function renderMarkdown(content: string): ReactNode {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc pl-4 my-1 space-y-0.5">
        {list.map((item, i) => <li key={i}>{parseInline(item, `${key}-li-${i}`)}</li>)}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ''));
    } else {
      flushList(String(idx));
      if (trimmed) blocks.push(<p key={`p-${idx}`} className="mb-1 last:mb-0">{parseInline(line, `p${idx}`)}</p>);
    }
  });
  flushList('end');

  return <>{blocks}</>;
}