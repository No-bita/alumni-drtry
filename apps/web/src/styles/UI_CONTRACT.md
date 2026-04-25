# UI Contract

This document defines implementation rules for UI consistency across `apps/web/src`.

## 1) Spacing Scale

Use token-backed spacing values only:

- `4px` (`--space-xs`): tiny offsets, badge nudges.
- `8px` (`--space-sm`): tight inline gaps, dense list spacing.
- `12px` (`--space-md`): compact block rhythm.
- `16px` (`--space-md-lg`): default control-to-control spacing.
- `24px` (`--space-lg`): section spacing inside cards/panels.
- `32px` (`--space-lg-xl`): major section boundaries.
- `48px` (`--space-xl-2`): page-level vertical separation.

Rules:

- Prefer CSS variables from `tokens.css` over hard-coded values.
- Avoid new one-off spacing values unless behavior-dynamic.
- Use inline `style` for spacing only when value is computed at runtime.

## 2) State Taxonomy

All route surfaces should map async UI to one of these states:

- `loading`: first load, data unavailable.
- `updating`: background refresh with visible stale data.
- `empty`: request succeeded, no results.
- `error`: request failed.
- `success`: mutation/action complete.

Rules:

- Use a single dominant state at a time per surface.
- If data exists and a refetch starts, show `updating` (not `loading`).
- Keep state labels user-readable and action-oriented.

## 3) Error Precedence

Render errors in this order (highest to lowest priority):

1. Blocking page/surface error
2. Field-level validation errors
3. Inline non-blocking action errors

Rules:

- Show the highest-priority error in the main attention area.
- Avoid stacking multiple red error blocks for the same action.
- Preserve field-level context near the field when possible.

## 4) CTA Priority by State

Use these primary-action rules:

- Normal state: one visually dominant primary CTA per active surface.
- Modal/dialog open: modal submit/cancel CTAs are primary; background CTAs are visually de-emphasized.
- Mutation pending: disable duplicate submit triggers and keep one progress CTA.

Specific route guidance:

- `Search`: `Search` remains primary; `Clear` remains secondary.
- `Career`: when chat/compose overlays are open, background sticky `Post a role` should not compete visually.
- `Build`: while compose dialog is open, feed actions should remain secondary.

## 5) Inline Style Rule

Allowed inline style cases:

- Dynamic layout/position values (virtualized transforms, measured heights, progress widths).
- Runtime-only values that cannot be tokenized safely.

Disallowed inline style cases:

- Static margin/padding/typography/color/border declarations.
- Repeated style objects that can be class-based.
