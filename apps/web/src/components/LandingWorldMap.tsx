import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingMapTestimonialPins } from "./LandingMapTestimonialPins";
import {
  isLandingMapIframeMessage,
  LANDING_MAP_PIN_LAYOUT,
  LANDING_MAP_READY,
  LANDING_MAP_SET_TESTIMONIALS,
  type LandingMapPinLayoutMessage,
} from "../lib/landingMapMessages";
import { landingMapTestimonialPinCoords } from "../lib/landingMapTestimonials";
import { useLandingMapCollisionGuard } from "../hooks/useLandingMapCollisionGuard";
import { usePhoneViewport } from "../hooks/usePhoneViewport";

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
  showTestimonials?: boolean;
};

/**
 * World map visual for the landing hero. Map iframe loads after paint; static canvas
 * when the user prefers reduced motion. Testimonial pins overlay syncs via postMessage.
 */
export function LandingWorldMap({ className, showTestimonials = true }: Props) {
  const defer = useDeferMapMount();
  const reducedMotion = usePrefersReducedMotion();
  const isPhone = usePhoneViewport();
  const src = reducedMotion ? MAP_STATIC_URL : MAP_URL;
  const mapRootRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pinLayout, setPinLayout] = useState<LandingMapPinLayoutMessage | null>(null);
  const [mapReady, setMapReady] = useState(reducedMotion);

  const dockVisible = showTestimonials && isPhone && (mapReady || reducedMotion);
  const collision = useLandingMapCollisionGuard(mapRootRef, {
    enabled: dockVisible,
    dockVisible,
  });

  const pushTestimonialPinsToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: LANDING_MAP_SET_TESTIMONIALS,
        pins: landingMapTestimonialPinCoords(),
      },
      window.location.origin
    );
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isLandingMapIframeMessage(event.data)) return;

      if (event.data.type === LANDING_MAP_PIN_LAYOUT) {
        setPinLayout(event.data);
        return;
      }
      if (event.data.type === LANDING_MAP_READY) {
        setMapReady(true);
        pushTestimonialPinsToIframe();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushTestimonialPinsToIframe]);

  useEffect(() => {
    if (!defer || reducedMotion) return;
    pushTestimonialPinsToIframe();
  }, [defer, reducedMotion, pushTestimonialPinsToIframe]);

  const handleIframeLoad = () => {
    pushTestimonialPinsToIframe();
    if (reducedMotion) {
      setMapReady(true);
    }
  };

  return (
    <div
      ref={mapRootRef}
      className={["landing-world-map", className].filter(Boolean).join(" ")}
      style={
        isPhone
          ? ({
              "--landing-map-pin-layer-bottom": `${collision.pinLayerBottomPx}px`,
              "--landing-map-pin-layer-top": `${collision.pinLayerTopPx}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {defer ? (
        <iframe
          ref={iframeRef}
          title="Alumni spread across the world"
          src={src}
          className="landing-world-map__frame"
          loading="lazy"
          onLoad={handleIframeLoad}
        />
      ) : (
        <div className="landing-world-map__fallback" aria-hidden />
      )}
      {showTestimonials && <LandingMapTestimonialPins
        layout={pinLayout}
        mapReady={mapReady}
        reducedMotion={reducedMotion}
        dockAnchor={collision.dockAnchor}
        className="landing-world-map__testimonials"
      />}
    </div>
  );
}
