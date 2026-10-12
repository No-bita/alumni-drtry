/**
 * Demo mode helpers (frontend only).
 *
 * Contract (implemented by the backend demo-login PR):
 * - GET /v1/auth/demo/config -> { enabled, demoEmail? }
 * - POST /v1/auth/demo-login { email, password } -> 200 { person: { isDemo: true, ... } }
 * - GET /v1/me -> person.isDemo === true for demo sessions (server-owned, never client-set)
 * - Blocked writes -> 403 with code "DEMO_READ_ONLY"
 *
 * Tour progress lives in sessionStorage only. It is never sent to the server, so the
 * shared demo account is never changed by one visitor's tour.
 */

export type DemoTourStop = {
  id: "directory" | "profile" | "city" | "map";
  /** Route the stop lives on. null = wherever the visitor is (profile pages have per-person URLs). */
  path: string | null;
  title: string;
  body: string;
};

export const DEMO_TOUR_STOPS: readonly DemoTourStop[] = [
  {
    id: "directory",
    path: "/search",
    title: "The directory",
    body: "Every alum in one place. Search by name, department or batch, then filter your way to the person you actually wanted to find.",
  },
  {
    id: "profile",
    path: null,
    title: "A profile",
    body: "Open any profile to see who they are now, where they live and what they do. (Everyone here is made up. Your real batchmates are safe.)",
  },
  {
    id: "city",
    path: "/intent/location/bengaluru",
    title: "The city board",
    body: "Moving somewhere new? Cities are where alumni post what they need and what they can offer: housing, intros, a first chai.",
  },
  {
    id: "map",
    path: "/intent/location/bengaluru",
    title: "Alumni around the world",
    body: "The popular cities strip shows where the network is thickest. Pick one and see who is already there.",
  },
] as const;

export const DEMO_TOUR_STORAGE_KEY = "alma:demo-tour:v1";
export const DEMO_BLOCKED_EVENT = "demo:blocked";

export const DEMO_BLOCKED_MESSAGE =
  "Nice try! This is a look-around account, so posting, editing and messaging are switched off. Join with your IIT BHU email to do it for real.";

export type DemoTourState = {
  status: "active" | "done" | "skipped";
  step: number;
};

export function isDemoPerson(person: { isDemo?: boolean } | null | undefined): boolean {
  return person?.isDemo === true;
}

/** True when an API error response means "the demo account is not allowed to do that". */
export function isDemoBlockedResponse(status: number, code: unknown): boolean {
  return status === 403 && code === "DEMO_READ_ONLY";
}

export function notifyDemoBlocked(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_BLOCKED_EVENT));
}

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), DEMO_TOUR_STOPS.length - 1);
}

export function readDemoTourState(storage: Pick<Storage, "getItem"> | null): DemoTourState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DEMO_TOUR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoTourState>;
    if (parsed.status !== "active" && parsed.status !== "done" && parsed.status !== "skipped") {
      return null;
    }
    return { status: parsed.status, step: clampStep(Number(parsed.step ?? 0)) };
  } catch {
    return null;
  }
}

export function writeDemoTourState(
  storage: Pick<Storage, "setItem"> | null,
  state: DemoTourState
): void {
  if (!storage) return;
  try {
    storage.setItem(DEMO_TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota: the tour just won't remember progress */
  }
}

export function clearDemoTourState(storage: Pick<Storage, "removeItem"> | null): void {
  if (!storage) return;
  try {
    storage.removeItem(DEMO_TOUR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getTourStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
