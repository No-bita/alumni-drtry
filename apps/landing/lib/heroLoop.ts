// Pure state machine for the hero loop (spec 5.2). No timers here, so it is easy to test.

export type HeroPhase = "question" | "answer";

export type HeroState = {
  index: number;
  phase: HeroPhase;
  /** True after a pill click: the answer is held longer before the loop resumes. */
  pinned: boolean;
};

export type HeroAction = { type: "tick" } | { type: "select"; index: number } | { type: "settle" };

export const QUESTION_MS = 1700;
export const ANSWER_MS = 3600;
export const PINNED_ANSWER_MS = 5000;

/** Start state: first pair, question phase (the loop then plays strike-through, answer, card). */
export function initialHeroState(): HeroState {
  return { index: 0, phase: "question", pinned: false };
}

/** How long the current state stays up before the next tick. */
export function delayFor(state: HeroState): number {
  if (state.phase === "question") return QUESTION_MS;
  return state.pinned ? PINNED_ANSWER_MS : ANSWER_MS;
}

export function heroReducer(state: HeroState, action: HeroAction, count: number): HeroState {
  if (count <= 0) return state;
  // Reduced motion: no loop, so jump straight to the readable answered state of the current pair.
  // Idempotent: return the same object when already answered, so React bails out and no re-render loop starts.
  if (action.type === "settle") return state.phase === "answer" ? state : { ...state, phase: "answer" };
  if (action.type === "select") {
    const index = ((Math.trunc(action.index) % count) + count) % count;
    return { index, phase: "answer", pinned: true };
  }
  if (state.phase === "question") return { index: state.index, phase: "answer", pinned: false };
  return { index: (state.index + 1) % count, phase: "question", pinned: false };
}
