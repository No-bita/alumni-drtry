# Neon (PostgreSQL) setup

Use [Neon](https://neon.tech) as the database for the API. Neon is serverless Postgres; the app uses the standard `pg` driver with your connection string.

---

## 1. Create a Neon project

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Choose region (e.g. same as your API for lower latency).
3. **Postgres version**: use **16** or **17**. Both work with this app; 16 is the conservative choice, 17 is newer. Neon lets you pick when creating the project.
4. Create a database (Neon gives you one by default, e.g. `neondb`).

---

## 2. Get the connection string

1. In the [Neon Console](https://console.neon.tech), open your project.
2. Click **Connect** (or go to the connection details).
3. Select **Connection string** and copy it. It looks like:
   ```text
   postgresql://USER:PASSWORD@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

**Pooled vs direct**

- **Pooled** (hostname contains `-pooler`): use if you run in serverless or expect many short-lived connections. Recommended for serverless/edge.
- **Direct**: fine for a long-lived Node server (e.g. Fastify). Your app uses a single `pg.Pool`, so either works; pooled is safer if you scale to many instances.

If you see both options in the Neon UI, you can use the **pooled** connection string for flexibility.

---

## 3. Configure the API

Set `DATABASE_URL` to your Neon connection string. The string must include `?sslmode=require` (Neon usually adds it).

**Option A: `.env` (local / dev)**

In `apps/api/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require
```

**Option B: Production**

Set `DATABASE_URL` in your host’s environment (Railway, Render, Fly.io, etc.) to the same format.

---

## 4. Run migrations

From the API app, run migrations once (they create tables and seed data):

```bash
cd apps/api
npm run migrate
```

You should see output like:

```text
Applied migration: 001_phase1
Applied migration: 002_phase2_foundations
...
```

---

## 5. Verify

1. Start the API: `npm run dev` (or `npm run start` with `DATABASE_URL` set).
2. Call the health endpoint:
   ```bash
   curl http://localhost:4000/healthz
   ```
   You should get `{"status":"ok","db":"ok"}` when Neon is reachable.

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Connection timeout / ECONNREFUSED | Check Neon project is not suspended; confirm host and port (5432) are correct. |
| SSL errors | Ensure the connection string includes `?sslmode=require`. |
| “Too many connections” | Use the **pooled** connection string (hostname with `-pooler`) from Neon. |
| Migrations fail | Ensure the Neon user has permission to create tables; use the main project role. |

No code changes are required: the app uses `pg` with `DATABASE_URL` and Neon speaks standard Postgres over SSL.
