# Observability Checklist

Use this to answer: *Can I see what’s happening in production and get notified when it breaks?*

| Item | Question to ask | Current state |
|------|-----------------|---------------|
| **Error monitoring** | Do I get alerted when something throws in production? | ✅ Yes. Sentry captures unhandled exceptions when `SENTRY_DSN` is set. Configure Sentry alerts for new issues / spike. |
| **Structured logs** | Can I search logs by user / request / error type? | ✅ Yes. Fastify logger with `reqId`, status, and `err` on errors. Ship logs to a backend (e.g. Datadog, Logtail) to search. |
| **Request tracing** | Can I follow one user’s login through every step? | ⚠️ Partial. Same request has one `reqId` in logs. For full tracing across services, add OpenTelemetry or similar later. |
| **Health endpoint** | Does `/healthz` tell me if the DB is alive? | ✅ Yes. `GET /healthz` returns 200 with `{ status: "ok", db: "ok" }` when DB is reachable, and 503 with `db: "error"` when it is not. |
| **Alerting** | Does someone get a message when the server is down or errors spike? | ⚠️ Configure. Use health-check and Sentry alerts (see below). |

---

## Error monitoring (Sentry)

- Set `SENTRY_DSN` in production (from [sentry.io](https://sentry.io) project settings). If unset, the app runs normally and only logs errors.
- Unhandled exceptions (non‑AppError) are sent to Sentry with `reqId`, method, and URL. AppErrors (4xx, 429) are not sent.
- In Sentry: create **Alerts** → “When a new issue is created” or “When the number of errors in an issue is above X” and send to email/Slack/PagerDuty.

---

## Alerting setup

1. **Health check failure**  
   - **Load balancer**: Mark instance unhealthy after N consecutive 5xx on `GET /healthz`, then alert on “no healthy targets” (e.g. AWS ALB, GCP health checks).  
   - **Cron / external**: Every 1–2 min, `curl -f https://api.example.com/healthz`; on failure, trigger PagerDuty/Opsgenie/email.

2. **Error spike**  
   In Sentry: **Alerts** → “When the number of events in an issue is above 10 in 1 hour” (or similar) → notify your channel.

3. **Server down**  
   Use your host’s process monitor (systemd, PM2, k8s liveness) to restart the process and/or alert when the process exits or stops responding.

---

## Log aggregation

- Fastify (Pino) logs JSON to stdout with `reqId`, `res.statusCode`, and `err` on errors.
- **Production**: Ensure stdout/stderr are captured — e.g. Docker/Kubernetes log collection, or a shipper (Fluentd, Vector, Datadog agent) that forwards to Datadog, Logtail, CloudWatch, etc.
- Then search by `reqId`, status code, or error message in your log backend.

---

## Request tracing (later)

If you add more services or serverless functions, consider OpenTelemetry (or your provider’s tracing) to trace a single request across the stack. For a single API, `reqId` in logs is enough.

---

## Health check behavior

- **200** `{ status: "ok", db: "ok" }` — App and DB are healthy. Use for load balancer / k8s readiness.
- **503** `{ status: "degraded", db: "error" }` — DB unreachable. Instance should be taken out of rotation until DB is back.
