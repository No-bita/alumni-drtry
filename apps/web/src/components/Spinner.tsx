/** Same visual as Login “sending” state (`.login-sending__spinner`). */
export function Spinner({ size = "md" }: { size?: "md" | "sm" }) {
  return (
    <div
      className={`login-sending__spinner${size === "sm" ? " login-sending__spinner--sm" : ""}`.trim()}
      aria-hidden
    />
  );
}
