import { GRADUATION_CAP_ICON_SRC } from "../lib/publicAssets";

type GraduationCapIconProps = {
  className?: string;
};

/** Cohort / graduation year glyph tinted via `currentColor`. */
export function GraduationCapIcon({ className }: GraduationCapIconProps) {
  return (
    <span
      className={className ? `public-mask-icon ${className}` : "public-mask-icon"}
      aria-hidden
      style={{
        WebkitMaskImage: `url("${GRADUATION_CAP_ICON_SRC}")`,
        maskImage: `url("${GRADUATION_CAP_ICON_SRC}")`,
      }}
    />
  );
}
