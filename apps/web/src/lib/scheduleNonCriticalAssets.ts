/**
 * Loads display / accent font CSS after first paint so they do not compete with
 * critical path (DM Sans + app shell). Display text uses Georgia until fonts apply.
 */
export function scheduleNonCriticalFontCss(): void {
  const load = () => {
    void Promise.all([
      import("@fontsource-variable/playfair-display/index.css"),
      import("@fontsource-variable/playfair-display/wght-italic.css"),
      import("@fontsource/cormorant-garamond/300.css"),
      import("@fontsource/cormorant-garamond/400.css"),
      import("@fontsource/cormorant-garamond/600.css"),
    ]);
  };

  if (typeof window === "undefined") {
    return;
  }

  const runAfterPaint = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => load(), { timeout: 2500 });
    } else {
      window.setTimeout(load, 1);
    }
  };

  if (document.readyState === "complete") {
    runAfterPaint();
  } else {
    window.addEventListener("load", runAfterPaint, { once: true });
  }
}
