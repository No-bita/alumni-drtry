/** Design tokens. Keep in sync with the @theme block in app/globals.css (a test enforces it). */
export const colors = {
  paper: "#F3EFE4",
  ink: "#1B1F2A",
  "pen-blue": "#1F3FA8",
  "stamp-red": "#B3261E",
  card: "#FFFDF7",
  label: "#4A4F5C",
  tint: "#EEF1FA",
} as const;

export type ColorToken = keyof typeof colors;

/** Ruled paper: one line every 36px. */
export const RULE_SPACING_PX = 36;
export const RULE_COLOR = "rgba(31, 63, 168, 0.09)";

/** Caveat is handwriting only, never below this size. */
export const HAND_MIN_PX = 24;

/** Stamp rotation range in degrees (spec: -4 to -8). */
export const STAMP_ROTATION_MIN = -8;
export const STAMP_ROTATION_MAX = -4;
