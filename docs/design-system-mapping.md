# Design System Mapping

This document maps `design_system` rules to implementation conventions in `apps/web`.

## 1. Tokens and Foundations

- Backgrounds
  - Primary surface: `--home-cream` / `#F7F5F2`
  - Card surface: `--surface` / `#FFFFFF`
  - Border: `rgba(26, 20, 15, 0.1)` close to `#E7E3DD`
- Text
  - Heading: `--ink`
  - Body: `--ink-muted`
  - Muted: `--ink-faint` / `#9A948E` equivalent
- Spacing
  - Grid base: 8px cadence via `--space-*` in `tokens.css`
  - Card padding target: 20–24px
  - Section spacing target: 24–32px

## 2. Reusable UI Primitives

Use shared classes from `components.css`:

- `.ds-surface-card`
- `.ds-title-lg`, `.ds-title-md`
- `.ds-copy`
- `.ds-meta`
- `.ds-chip`
- `.ds-chip--active`
- `.ds-action-row`
- `.ds-action-row--single`
- `.ds-input`
- `.ds-section-head`

## 3. CTA Hierarchy Rules

- One dominant CTA per card/surface.
- Secondary actions should be `btn--secondary` or text links.
- Avoid multiple dark-filled buttons in the same card row.
- During focused tasks (dialogs/forms), keep background actions visually secondary.

## 4. Component Contract Mapping

- `action_card`
  - icon + title + subtitle + optional single CTA
- `request_card`
  - identity/meta + title + max two-line description + tags + one primary CTA
- `person_card`
  - avatar + name + role/company + badges + one primary CTA
- `project_card`
  - stage + title + description + skills/tags + collaborator/meta + CTA

## 5. Page Pattern Mapping

- Home
  - action hero -> opportunities feed -> network growth -> resources
- Career
  - intent input -> matching results -> connection CTA
- Cities
  - city header -> actions -> live requests -> people -> events
- Build
  - action hero -> project feed -> contribution panel

## 6. Implementation Notes

- Prefer class-based styling over inline static style.
- Keep long descriptions to two lines where practical.
- Maintain rounded corners, soft borders, and low-shadow visuals.
