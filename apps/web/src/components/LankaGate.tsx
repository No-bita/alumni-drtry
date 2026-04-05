import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Lanka Gate — twin-arch outline (IIT BHU). Two halves drift apart while waiting;
 * burst fully open when `phase` is `entered` (e.g. after correct OTP).
 * Eyes follow pointer/focus with shared gaze (both pupils use the same offset); blink + droozy idle only.
 */
type LankaGateProps = {
  phase: "waiting" | "entered";
  /** Called after the “entered” open animation finishes (for navigation). */
  onEnteredAnimationEnd?: () => void;
};

const ENTERED_MS = 900;
const IDLE_BLINK_MS = 3500;
const IDLE_DROOZY_MS = 15000;

/** Eye anchor positions in viewBox (centers of each eye). */
const EYE_ANCHOR_LEFT_X = 68;
const EYE_ANCHOR_RIGHT_X = 132;
const EYE_ANCHOR_Y = 88;

/** Vertical oval sclera (viewBox units): taller than wide. */
const EYE_RX = 10;
const EYE_RY = 14;
const PUPIL_R = 4.5;

type Pupil = { x: number; y: number };

/** Keep pupil inside the oval (with margin). */
function clampPupilToEye(local: DOMPoint): Pupil {
  const marginX = 1.1;
  const marginY = 0.85;
  const rx = EYE_RX - PUPIL_R - marginX;
  const ry = EYE_RY - PUPIL_R - marginY;
  if (rx <= 0 || ry <= 0) return { x: 0, y: 0 };
  let x = local.x;
  let y = local.y;
  const n = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (n > 1) {
    const s = 1 / Math.sqrt(n);
    x *= s;
    y *= s;
  }
  return { x, y };
}

export function LankaGate({ phase, onEnteredAnimationEnd }: LankaGateProps) {
  const leftEyeRootRef = useRef<SVGGElement>(null);
  const rightEyeRootRef = useRef<SVGGElement>(null);
  /** Pointer movement / click only — keyboard focus does not reset idle. */
  const lastPointerInteractionMs = useRef(0);
  useLayoutEffect(() => {
    lastPointerInteractionMs.current = Date.now();
  }, []);

  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  const [pupilL, setPupilL] = useState<Pupil>({ x: 0, y: 0 });
  const [pupilR, setPupilR] = useState<Pupil>({ x: 0, y: 0 });
  const [isDroozy, setIsDroozy] = useState(false);
  const [blinkKey, setBlinkKey] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const markPointerInteraction = useCallback(() => {
    lastPointerInteractionMs.current = Date.now();
    setIsDroozy(false);
  }, []);

  const updateGazeFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const left = leftEyeRootRef.current;
    const right = rightEyeRootRef.current;
    if (!left || !right) return;

    const lr = left.getBoundingClientRect();
    const rr = right.getBoundingClientRect();
    const midCx = (lr.left + lr.width / 2 + rr.left + rr.width / 2) / 2;
    const midCy = (lr.top + lr.height / 2 + rr.top + rr.height / 2) / 2;

    const ctm = left.getScreenCTM();
    if (!ctm) return;
    let inv: DOMMatrix;
    try {
      inv = ctm.inverse();
    } catch {
      return;
    }

    const pt = new DOMPoint(clientX, clientY);
    const pMid = new DOMPoint(midCx, midCy);
    const pCur = pt.matrixTransform(inv);
    const pMidL = pMid.matrixTransform(inv);
    const raw = new DOMPoint(pCur.x - pMidL.x, pCur.y - pMidL.y);
    const pupil = clampPupilToEye(raw);
    setPupilL(pupil);
    setPupilR(pupil);
  }, []);

  useEffect(() => {
    if (phase !== "entered" || !onEnteredAnimationEnd) return;
    const t = window.setTimeout(onEnteredAnimationEnd, ENTERED_MS);
    return () => window.clearTimeout(t);
  }, [phase, onEnteredAnimationEnd]);

  /** Droozy after 15s without pointer move / click. */
  useEffect(() => {
    if (reduceMotion) {
      queueMicrotask(() => setIsDroozy(false));
      return;
    }
    const tick = () => {
      const idle = Date.now() - lastPointerInteractionMs.current;
      setIsDroozy(idle >= IDLE_DROOZY_MS);
    };
    const id = window.setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [reduceMotion]);

  /** Blink every 3.5s when pointer-idle ≥3.5s; never while droozy (idle ≥15s). */
  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      const idle = Date.now() - lastPointerInteractionMs.current;
      if (idle < IDLE_BLINK_MS) return;
      if (idle >= IDLE_DROOZY_MS) return;
      setBlinkKey((k) => k + 1);
    }, IDLE_BLINK_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  /** Pointer move + click reset idle (not keyboard focus). */
  useEffect(() => {
    if (reduceMotion) return;

    const onPointerMove = (e: PointerEvent) => {
      markPointerInteraction();
      updateGazeFromClientPoint(e.clientX, e.clientY);
    };

    const onPointerOnly = () => {
      markPointerInteraction();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerOnly, true);
    window.addEventListener("click", onPointerOnly, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerOnly, true);
      window.removeEventListener("click", onPointerOnly, true);
    };
  }, [reduceMotion, markPointerInteraction, updateGazeFromClientPoint]);

  useEffect(() => {
    if (reduceMotion) {
      queueMicrotask(() => {
        setPupilL({ x: 0, y: 0 });
        setPupilR({ x: 0, y: 0 });
      });
      return;
    }

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.matches("input, textarea, select, button, a[href], [role='button']")) return;
      const r = t.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      updateGazeFromClientPoint(r.left + r.width / 2, r.top + r.height / 2);
    };

    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
    };
  }, [reduceMotion, updateGazeFromClientPoint]);

  const rootClass = [
    "lanka-gate",
    phase === "entered" ? "lanka-gate--entered" : "lanka-gate--waiting",
    isDroozy && !reduceMotion ? "lanka-gate--droozy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const droopY = isDroozy && !reduceMotion ? 1.1 : 0;

  const eyeInner = (pupil: Pupil, side: "L" | "R") => (
    <>
      <g key={`blink-${side}-${blinkKey}`} className="lanka-gate__eye-blink-anim">
        <ellipse
          className="lanka-gate__eye-sclera"
          cx="0"
          cy="0"
          rx={EYE_RX}
          ry={EYE_RY}
        />
        <g
          className="lanka-gate__eye-pupil-group"
          transform={`translate(${pupil.x} ${pupil.y + droopY})`}
        >
          <circle className="lanka-gate__eye-pupil" r={PUPIL_R} cx="0" cy="0" />
          <circle className="lanka-gate__eye-shine" r="1.35" cx="1.6" cy="-1.2" />
        </g>
      </g>
      <path
        className="lanka-gate__eye-droopy-lid"
        d={`M ${-EYE_RX - 1} 5 Q 0 -8 ${EYE_RX + 1} 5 L ${EYE_RX + 1} ${-EYE_RY - 6} L ${-EYE_RX - 1} ${-EYE_RY - 6} Z`}
        fill="currentColor"
      />
    </>
  );

  return (
    <div className={rootClass} aria-hidden>
      <svg
        className="lanka-gate__svg"
        viewBox="0 0 200 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Lanka Gate outline</title>
        <g className="lanka-gate__half lanka-gate__half--left">
          <path
            d="M 2 126 L 2 44 Q 48 6 98 38 L 98 126 Z"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinejoin="round"
          />
          <path
            d="M 18 126 L 18 72 Q 48 48 82 58"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity="0.45"
          />
          <g
            ref={leftEyeRootRef}
            transform={`translate(${EYE_ANCHOR_LEFT_X} ${EYE_ANCHOR_Y})`}
            className="lanka-gate__eye-stack"
          >
            {eyeInner(pupilL, "L")}
          </g>
        </g>
        <g className="lanka-gate__half lanka-gate__half--right">
          <path
            d="M 102 38 Q 152 6 198 44 L 198 126 L 102 126 Z"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinejoin="round"
          />
          <path
            d="M 118 58 Q 152 48 182 72 L 182 126"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity="0.45"
          />
          <g
            ref={rightEyeRootRef}
            transform={`translate(${EYE_ANCHOR_RIGHT_X} ${EYE_ANCHOR_Y})`}
            className="lanka-gate__eye-stack"
          >
            {eyeInner(pupilR, "R")}
          </g>
        </g>
        <line
          x1="100"
          y1="34"
          x2="100"
          y2="126"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.35"
          className="lanka-gate__keystone"
        />
      </svg>
    </div>
  );
}
