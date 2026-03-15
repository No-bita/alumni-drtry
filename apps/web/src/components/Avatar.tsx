type AvatarSize = "lg" | "md" | "sm";

type AvatarProps = {
  name: string;
  size?: AvatarSize;
  className?: string;
};

const COLORS = [
  "var(--ochre-light)",
  "rgba(196, 112, 58, 0.4)",
  "rgba(61, 90, 46, 0.4)",
  "rgba(139, 58, 42, 0.3)",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  const initials = getInitials(name || "?");
  const colorIndex = hash(name || "0") % COLORS.length;
  const bg = COLORS[colorIndex];
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
