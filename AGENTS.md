# Agent / contributor notes

## API deploys (Railway) vs GitHub

**Pushes to `main` that touch `apps/api/**` automatically deploy** via [`.github/workflows/deploy-api-railway.yml`](.github/workflows/deploy-api-railway.yml) (GitHub Actions → `railway up` on the `alumni-api` production service).

The web app may still auto-deploy from GitHub (e.g. Vercel); the API does **not** use the same host.

### One-time: enable CI deploys

1. In [Railway](https://railway.com) → project **profound-nourishment** → **Settings** → **Tokens**, create a **project token** scoped to **production**.
2. In GitHub → repo **Settings** → **Secrets and variables** → **Actions**, add **`RAILWAY_TOKEN`** with that value.

Until `RAILWAY_TOKEN` is set, the workflow fails and you must deploy manually (below).

### Manual deploy (local)

From a machine linked with `railway link` (`apps/api`):

```bash
cd apps/api && railway up --environment=production
# or restart the last build without uploading local files:
cd apps/api && railway redeploy --from-source
```

Confirm service name **`alumni-api`** and environment **production** in the Railway dashboard.
