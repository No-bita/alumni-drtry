import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const betaUsageExportQuery = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  windowHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
  limit: z.coerce.number().int().min(1).max(50_000).default(10_000)
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

  app.get(
    "/v1/admin/metrics",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const metrics = await app.adminMetricsService.getMetrics();
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
