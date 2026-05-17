import { useEffect, useState } from "react";

/** Matches shell phone breakpoint (`--bp` 639px) and login map dock layout. */
export const PHONE_VIEWPORT_MAX_PX = 639;

export function usePhoneViewport(): boolean {
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${PHONE_VIEWPORT_MAX_PX}px)`).matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${PHONE_VIEWPORT_MAX_PX}px)`);
    const apply = () => setIsPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return isPhone;
}
