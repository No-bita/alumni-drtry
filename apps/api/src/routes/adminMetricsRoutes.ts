import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BETA_USAGE_EVENT_TYPES } from "../lib/betaUsageEventTypes.js";

const analyticsQuery = z.object({
  days: z.enum(["7", "30", "90"]).default("30"),
  /** Skip the 5-minute cache (the screen's Refresh button). */
  fresh: z.enum(["1"]).optional()
});

const betaUsageExportQuery = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  windowHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
  limit: z.coerce.number().int().min(1).max(50_000).default(10_000)
});

const betaUsageEventBody = z.object({
  eventType: z.enum(BETA_USAGE_EVENT_TYPES),
  route: z.string().trim().min(1).max(256),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function toCsv(rows: Array<{
  occurredAt: string;
  eventType: string;
  personId: string | null;
  route: string;
  metadata: Record<string, unknown>;
}>): string {
  if (rows.length === 0) {
    return "occurredAt,eventType,personId,route,metadata\n";
  }
  const header = ["occurredAt", "eventType", "personId", "route", "metadata"];
  const escape = (value: unknown) => {
    const raw = value == null ? "" : String(value);
    if (/[",\n]/.test(raw)) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };
  const lines = rows.map((row) =>
    [
      escape(row.occurredAt),
      escape(row.eventType),
      escape(row.personId),
      escape(row.route),
      escape(JSON.stringify(row.metadata ?? {}))
    ].join(",")
  );
  return `${header.join(",")}\n${lines.join("\n")}\n`;
}

export const adminMetricsRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = [app.authenticate, app.requireAdmin];
  const usageEventPreHandlers = [app.authenticate];

  app.post(
    "/v1/analytics/beta-usage-event",
    { preHandler: usageEventPreHandlers },
    async (request, reply) => {
      const parsed = betaUsageEventBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "BETA_USAGE_EVENT_BAD_REQUEST", message: "Invalid event payload." });
      }
      const actor = request.actor ?? null;
      await app.adminMetricsService.logBetaUsageEvent({
        eventType: parsed.data.eventType,
        personId: actor?.personId ?? null,
        route: parsed.data.route,
        metadata: parsed.data.metadata ?? {},
        isDemo: Boolean(actor?.isDemo),
      });
      return reply.code(202).send({ ok: true });
    }
  );

  app.get(
    "/v1/admin/metrics",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const metrics = await app.adminMetricsService.getMetrics();
      return reply.code(200).send({ metrics });
    }
  );

  /** Everything on the analytics screen for one window (7, 30 or 90 days), plus 12-week trends. */
  app.get(
    "/v1/admin/analytics",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const parsed = analyticsQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ code: "ADMIN_ANALYTICS_BAD_REQUEST", message: "days must be 7, 30 or 90." });
      }
      const days = Number(parsed.data.days) as 7 | 30 | 90;
      const report = await app.analyticsService.report(days, { fresh: parsed.data.fresh === "1" });
      return reply.code(200).send({ report });
    }
  );

  /** Ask → Match funnel (last 30 days) + current profile completeness. */
  app.get(
    "/v1/admin/metrics/ask-match",
    { preHandler: adminPreHandlers },
    async (_request, reply) => {
      const metrics = await app.adminMetricsService.getAskMatchMetrics(30);
      return reply.code(200).send({ metrics });
    }
  );

  app.get(
    "/v1/admin/metrics/beta/usage",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const parsed = betaUsageExportQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ code: "ADMIN_METRICS_BAD_REQUEST", message: "Invalid export query." });
      }

      const summary = await app.adminMetricsService.getBetaUsageSummary(parsed.data.windowHours);
      const rows = await app.adminMetricsService.getBetaUsageExportRows(
        parsed.data.windowHours,
        parsed.data.limit
      );

      if (parsed.data.format === "csv") {
        const csv = toCsv(rows);
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="beta-usage-${parsed.data.windowHours}h.csv"`
        );
        return reply.code(200).send(csv);
      }

      return reply.code(200).send({ summary, rows });
    }
  );
};
