import { useEffect, useState, type ComponentType } from "react";

/**
 * Loads `@vercel/analytics` only in production, after `window` `load` and during idle time
 * so it does not compete with LCP/critical JS or deferred font CSS.
 */
export function DeferredVercelAnalytics() {
  const [Analytics, setAnalytics] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }

    let idleHandle: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loadAnalytics = () => {
      void import("@vercel/analytics/react").then((mod) => {
        setAnalytics(() => mod.Analytics);
      });
    };

    const scheduleIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(loadAnalytics, { timeout: 5000 });
      } else {
        timeoutId = window.setTimeout(loadAnalytics, 0);
      }
    };

    const onLoad = () => scheduleIdle();

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      window.removeEventListener("load", onLoad);
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  if (!Analytics) {
    return null;
  }

  return <Analytics />;
}
