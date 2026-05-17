import { MESSAGE_ICON_SRC } from "../lib/publicAssets";

type MessageIconProps = {
  className?: string;
};

/** Public-folder message glyph tinted via `currentColor` (matches CTA label). */
export function MessageIcon({ className }: MessageIconProps) {
  return (
    <span
      className={className ? `public-mask-icon ${className}` : "public-mask-icon"}
      aria-hidden
      style={{
        WebkitMaskImage: `url("${MESSAGE_ICON_SRC}")`,
        maskImage: `url("${MESSAGE_ICON_SRC}")`,
      }}
    />
  );
}
