import type { ReactNode } from "react";

type Props = {
  /** City cloud or other hero visual */
  children?: ReactNode;
};

/** Compact shell aligned with location page surfaces; pass `children` for the main visual. */
export function LocationLensWorldMap({ children }: Props) {
  return (
    <div className="location-lens-map">
      <div className="location-lens-map__inner">
        <div className="location-lens-map__stage">{children}</div>
      </div>
    </div>
  );
}
