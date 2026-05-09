type DemoAuthorBadgeProps = {
  className?: string;
};

/** Non-interactive label aligned with `.chip` styling — demo/test alumni content in feeds. */
export function DemoAuthorBadge({ className = "" }: DemoAuthorBadgeProps) {
  return (
    <span className={`chip chip--sm chip--demo-badge${className ? ` ${className}` : ""}`} aria-label="Demo account">
      Demo
    </span>
  );
}
