"use client";

import { useEffect } from "react";
import { warmUpLandingApi } from "../lib/apiWarmup.ts";

/** No markup or readiness dependency: start only after the landing has painted. */
export function LandingApiWarmup() {
  useEffect(() => {
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(warmUpLandingApi, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
