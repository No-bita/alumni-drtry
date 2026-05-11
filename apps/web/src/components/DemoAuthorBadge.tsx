type DemoAuthorBadgeProps = {
  className?: string;
};

/** Non-interactive label — matches `.ds-chip` used elsewhere in product chrome. */
export function DemoAuthorBadge({ className = "" }: DemoAuthorBadgeProps) {
  return (
    <span className={`ds-chip demo-author-badge${className ? ` ${className}` : ""}`} aria-label="Demo account">
      Demo
    </span>
  );
}
