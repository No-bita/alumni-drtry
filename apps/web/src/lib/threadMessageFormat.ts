/** Shared helpers for connection-thread UI (full page + messaging widget). */

export function replySnippet(body: string, maxChars = 120): string {
  const single = body.replace(/\s+/g, " ").trim();
  if (single.length <= maxChars) return single;
  return `${single.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** Full conversation page: month/day + time. */
export function formatThreadMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Messaging widget list rows and inline message ticks (time only). */
export function formatThreadCompactTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const now = new Date();
  const isSameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  if (isSameDay) {
    return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
