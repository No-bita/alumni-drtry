import type { ReactNode } from "react";

/** Plain text only: never interpret saved post content as HTML or Markdown. */
export function PostBodyLinks({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const urls = /https?:\/\/[^\s<>"']+/gi;
  let end = 0;
  for (const match of text.matchAll(urls)) {
    const start = match.index;
    // Do not turn a URL embedded inside another scheme or word into a link.
    if (start > 0 && /[\w:/]/.test(text[start - 1])) continue;
    let visible = match[0].replace(/[.,!?:;]+$/, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (visible.endsWith(close) && visible.split(close).length > visible.split(open).length) {
        visible = visible.slice(0, -1);
      }
    }
    visible = visible.replace(/[.,!?:;]+$/, "");
    try {
      const url = new URL(visible);
      if (!url.hostname || !["http:", "https:"].includes(url.protocol)) continue;
    } catch {
      continue;
    }
    parts.push(text.slice(end, start));
    parts.push(<a key={start} href={visible} target="_blank" rel="noopener noreferrer">{visible}</a>);
    end = start + visible.length;
  }
  parts.push(text.slice(end));
  return <span className="wall-post-body-links">{parts}</span>;
}
