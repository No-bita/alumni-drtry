# Alma Mater landing page

Landing page for Alma Mater, an alumni platform that helps people use their alumni network to get things done. Every call to action opens the live platform at `app.almamater.aaryanshah.co.in/login` (`PLATFORM_URL` in `content/copy.ts`); the platform itself lives in a separate repo.

Built in phases, one pull request per phase.

## Where things live

- `content/` — all page copy (`copy.ts`, `heroPairs.ts`, `taskWall.ts`). Edit copy here, not in components.
- `components/` — page sections and base components.
- `app/layout.tsx` — fonts and page metadata (title, description, Open Graph, Twitter).
- `app/icon.svg` — favicon. `app/opengraph-image.png` (+ `.alt.txt`) — share image. Both are Next.js file conventions.
- `/preview` — design tokens and base components.

## Scripts

- `npm run dev` / `npm run build` / `npm start`
- `npm test` — compiles and runs the content, component and section tests.
- `npm run lint`

## Environment

No secrets in this repo. `.env.example` lists the only (optional) variable: `NEXT_PUBLIC_SITE_URL`, the public origin used to build absolute share-image URLs.
