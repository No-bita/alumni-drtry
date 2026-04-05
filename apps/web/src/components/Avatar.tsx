type AvatarSize = "lg" | "md" | "sm";

type AvatarProps = {
  name: string;
  size?: AvatarSize;
  className?: string;
  /** Softer pastel backgrounds (e.g. home directory cards). */
  tone?: "default" | "pastel";
};

const COLORS = [
  "var(--ochre-light)",
  "rgba(196, 112, 58, 0.4)",
  "rgba(61, 90, 46, 0.4)",
  "rgba(139, 58, 42, 0.3)",
];

const PASTEL_COLORS = [
  "#e8d4d4", // muted red
  "#c5e0dc", // teal
  "#c8d4eb", // blue
  "#d8cfe8", // purple
  "#d4e8c9", // green
  "#ebe4c8", // warm yellow
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "?";
    const b = parts[parts.length - 1]![0] ?? "?";
    return (a + b).toUpperCase();
  }
  const w = parts[0]!;
  return w.length >= 2 ? w.slice(0, 2).toUpperCase() : w.toUpperCase();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

export function Avatar({ name, size = "md", className = "", tone = "default" }: AvatarProps) {
  const initials = getInitials(name || "?");
  const palette = tone === "pastel" ? PASTEL_COLORS : COLORS;
  const colorIndex = hash(name || "0") % palette.length;
  const bg = palette[colorIndex];
  return (
    <div
      className={`avatar avatar--${size} ${className}`.trim()}
      style={{ background: bg }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
