/** Empty-Wall example card: the three example asks and the frame-by-frame typing script. */

export const WALL_EMPTY_EXAMPLES = [
  "Need a referral for a product role at a Bengaluru fintech. Anyone there?",
  "Hiring a backend engineer for our early-stage team. Alumni first.",
  "Moving to Pune next month. Tips on areas near Hinjewadi?",
] as const;

export const WALL_EMPTY_FINAL_TEXT = "Your post here";
export const WALL_EMPTY_SESSION_KEY = "alma.wallEmptyPrompt.played";
export const WALL_EMPTY_HOLD_MS = 1600;
export const WALL_EMPTY_DELETE_MS = 12;

export type WallEmptyStep = { text: string; delay: number; final?: boolean };

/** Typing speed with small, regular variation, and a short pause after punctuation. */
function charDelay(index: number, ch: string): number {
  const base = 35 + (index % 3) * 5;
  return /[,.?]/.test(ch) ? base + 220 : base;
}

/** The whole animation as a list of frames: what to show, and how long to wait before the next one. */
export function buildWallEmptyScript(examples: readonly string[] = WALL_EMPTY_EXAMPLES): WallEmptyStep[] {
  const steps: WallEmptyStep[] = [{ text: "", delay: 400 }];
  examples.forEach((example, exampleIndex) => {
    for (let i = 1; i <= example.length; i += 1) {
      steps.push({ text: example.slice(0, i), delay: charDelay(i, example[i - 1] ?? "") });
    }
    // Hold the finished example before moving on.
    steps[steps.length - 1] = { ...steps[steps.length - 1]!, delay: WALL_EMPTY_HOLD_MS };
    const isLast = exampleIndex === examples.length - 1;
    if (!isLast) {
      for (let i = example.length - 1; i >= 0; i -= 1) {
        steps.push({ text: example.slice(0, i), delay: i === 0 ? 300 : WALL_EMPTY_DELETE_MS });
      }
    }
  });
  steps.push({ text: WALL_EMPTY_FINAL_TEXT, delay: 0, final: true });
  return steps;
}
