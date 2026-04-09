# IIT BHU Alumni — Web App

React frontend for the alumni platform. Implements the design system (Playfair Display, DM Sans, campus-inspired palette) and screens: Landing, Login, Search, Profile, Onboarding.

## Setup

```bash
npm install
cp .env.example .env   # optional: set VITE_API_URL for production API
npm run dev
```

Runs at `http://localhost:5173`. In development, API requests to `/v1/*` are proxied to `http://localhost:4000` so the backend API must be running for auth and data.

## Build

```bash
npm run build
npm run preview   # serve dist/
```

## Performance benchmark scaffold

```bash
npm run perf:budget      # chunk-size budget checks from dist/assets
npm run perf:lighthouse  # Lighthouse CI run (configured in lighthouserc.json)
npm run perf:ci          # build + budgets + Lighthouse
```

Notes:

- Budget thresholds and route targets live in `../docs/performance-benchmarks.md`.
- Iteration report template: `../docs/performance-iteration-log-template.md`.

For **Vercel**, `vercel.json` can rewrite `/v1/*` to your hosted API so the browser stays same-origin (leave `VITE_API_URL` unset). Alternatively set `VITE_API_URL` to the API origin and configure API `CORS_ORIGIN` to your frontend.

## Design

- **Fonts**: Playfair Display (headlines, accents), DM Sans (body, UI)
- **Colors**: Brick, ochre, cream, ink — see `src/styles/tokens.css`
- **Screens**: Landing, Login, Search, Profile, Onboarding (welcome → steps 1–4 → done)
