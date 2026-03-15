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

For production, set `VITE_API_URL` to your API origin (e.g. `https://api.example.com`) so requests go to the correct host.

## Design

- **Fonts**: Playfair Display (headlines, accents), DM Sans (body, UI)
- **Colors**: Brick, ochre, cream, ink — see `src/styles/tokens.css`
- **Screens**: Landing, Login, Search, Profile, Onboarding (welcome → steps 1–4 → done)
