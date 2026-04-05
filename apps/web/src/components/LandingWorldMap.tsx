import { useEffect, useState } from "react";

const MAP_URL = "/media/World_Map_Vns.html?embed=1";
const MAP_STATIC_URL = `${MAP_URL}&mode=static`;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * Defers mounting the map until after the first paint so hero copy can render first.
 */
function useDeferMapMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);
  return ready;
}

type Props = {
  className?: string;
};

/**
 * World map visual for the landing hero. Map iframe loads after paint; static canvas
 * when the user prefers reduced motion. Fallback panel matches colors if iframe fails to paint.
 */
export function LandingWorldMap({ className }: Props) {
  const defer = useDeferMapMount();
  const reducedMotion = usePrefersReducedMotion();
  const src = reducedMotion ? MAP_STATIC_URL : MAP_URL;

  return (
    <div className={["landing-world-map", className].filter(Boolean).join(" ")}>
      {defer ? (
        <iframe
          title="Alumni spread across the world"
          src={src}
          className="landing-world-map__frame"
          loading="lazy"
        />
      ) : (
        <div className="landing-world-map__fallback" aria-hidden />
      )}
    </div>
  );
}
