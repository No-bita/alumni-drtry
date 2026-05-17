type AvatarSize = "xl" | "lg" | "md" | "sm";

type AvatarProps = {
  name: string;
  size?: AvatarSize;
  className?: string;
  /** Kept for call-site compatibility; fill is always brand sandstone + cream initials (product palette). */
  tone?: "default" | "pastel" | "pastel-fixed";
};

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

export function Avatar({ name, size = "md", className = "", tone: _tone = "default" }: AvatarProps) {
  const initials = getInitials(name || "?");
  return (
    <div className={`avatar avatar--${size} ${className}`.trim()} aria-hidden>
      {initials}
    </div>
  );
}
