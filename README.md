# IIT BHU Alumni Platform

Alumni directory and networking platform for IIT BHU (Varanasi) with verified institutional identity, search, intentcasts, and contact requests.

## Architecture

```
Repo 2/
├── apps/
│   ├── api/          # Fastify REST API (Node.js 20+)
│   └── web/          # React frontend (Vite, TypeScript)
├── docs/              # Roadmap and phase documentation
└── README.md
```

- **API**: TypeScript, Fastify, PostgreSQL, OTP + magic-link auth
- **Web**: React, Vite, design system (Playfair Display, DM Sans, campus palette)
- **Phases**: 1 (Foundation) → 2 (Directory) → 3 (Contact) → 4 (Admin)

## Quick Start

```bash
cd apps/api
cp .env.example .env    # Set DATABASE_URL, APP_BASE_URL, AUTH_SECRET_PEPPER
npm install
npm run migrate
npm run dev
```

API runs at `http://localhost:4000`. Start the web app from `apps/web` (see [apps/web/README.md](apps/web/README.md)); in dev it proxies `/v1` to the API. See [apps/api/README.md](apps/api/README.md) for API setup and endpoints.

## Production Checklist

Before deploying:

1. **CORS**: Set `CORS_ORIGIN` to your frontend origin(s), e.g. `https://app.example.com` or comma-separated list. Default `*` allows all (dev only).
2. **Email**: Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` for real email delivery.
3. **Intentcast expiry**: Schedule `npm run job:intentcasts:expire` via cron or worker (e.g. daily) to auto-close intentcasts after 7 days.

## Testing

```bash
cd apps/api
npm test
```

Auth integration tests require a PostgreSQL database. Set `DATABASE_URL` (or use default `postgres://localhost:5432/alumni_test`) and run migrations before tests.

## Documentation

- [MVP Roadmap](docs/mvp-roadmap.md) — Phase status and build order
- [Phase 1 Verification](docs/phase1-verification.md) — Auth flow details
- [Bulletin feed ranking](docs/bulletin-feed-ranking.md) — How intentcast posts are ordered (`GET /v1/intentcasts`); **update when feed SQL changes**