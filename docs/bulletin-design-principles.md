# Bulletin section — design principles (Apple-inspired)

This document captures the visual and interaction patterns used for the home sidebar **Bulletin** (intentcasts) in `apps/web`. Implementation lives in `Home.tsx` (structure) and `components.css` (classes under `home-dashboard__bulletin*`).

## Layout & container

- **Sidebar outer column (gradient strip)** — CSS: `.home-dashboard__main > .home-dashboard__col--side`. Vertical gradient stops (see `tokens.css`): **top** `#fffcf7` (`--home-sidebar-shell-top`), **~42%** `#f2efe6` (`--home-sand`, same as global page background), **bottom** `#e4ded2` (`--home-sidebar-shell-bottom`). Inset top highlight for separation from the page.
- **Frosted panel (“material”)** — A single outer shell uses a light translucent fill, **backdrop blur** (`saturate` + `blur`), and a soft **layered shadow** so the block reads as a floating surface over the page background.
- **Large corner radius** — The panel uses a **~22px** radius; inner cards use **~16px** for a calm, product-style curve (vs. sharp editorial cards).
- **Hairline separation** — Borders are **low-contrast** (fractional opacity) instead of heavy rules; header is separated from content with a subtle bottom edge.

## Typography

- **Sans-first hierarchy** — Section title and body use the UI font (**DM Sans**), not serif, for clarity and density similar to Apple’s system UI.
- **Tight negative letter-spacing** on titles and body for a refined, “designed” headline feel.
- **Readable body** — Post text is **roman** (not italic), **~15px**, **line-height ~1.47**, with a **line clamp** so the feed stays scannable.
- **Secondary meta** — Author, department, and time are **smaller**, **muted**, and read as supporting metadata.

## Color & depth

- **Restrained palette** — Surfaces stay **white / near-white** with **ink** and **muted ink** for text; category pills add **soft tinted** backgrounds (per category) instead of loud flat colors.
- **Elevation through shadow** — Cards use **light shadows** and a slight **hover** lift (shadow + transition), not strong borders alone.

## Components

- **Pill tags** — Categories are **capsule / pill** shapes with **rounded-full** geometry, small type, and **semantic tint** (hiring, mentorship, collaboration, guidance).
- **“Yours” badge** — Own posts use a **neutral mini-pill** so ownership is clear without competing with category color.
- **Primary action as capsule** — **Reply** is a **pill button** with **brand (brick) tint** so it stays on-palette while feeling like a primary tap target.
- **Compose CTA** — Full-width **rounded bar**, neutral fill, **+** in a **circular** chip—similar to a prominent but secondary system action.

## Forms & focus

- **Rounded inputs** — Textareas use a **~12px** radius, light border, and **brick-tinted focus ring** (focus-visible pattern) for accessible, on-brand focus.

## Motion

- **Short transitions** — Hover and active states use **~0.15–0.2s** easing on background, shadow, and **subtle scale** on press for buttons—enough feedback without distraction.

## Content model

- **Clear header** — **Title + caption** (“Bulletin” / what the section is for) establishes context before the list.
- **Empty state** — Short, centered, muted copy when there are no posts.

---

*These principles are **inspired by** Apple’s marketing and system UI (frosted materials, pills, typography rhythm); the **color accent** is aligned with the app’s **brick** token rather than system blue.*
