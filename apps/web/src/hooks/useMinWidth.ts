import { useEffect, useState } from "react";

function matches(px: number): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(`(min-width: ${px}px)`).matches
    : false;
}

/** True while the viewport is at least `px` wide. False where matchMedia is missing (tests, old browsers). */
export function useMinWidth(px: number): boolean {
  const [wide, setWide] = useState(() => matches(px));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [px]);
  return wide;
}
