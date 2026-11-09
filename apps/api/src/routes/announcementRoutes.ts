import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DEPARTMENTS } from "../constants/departmentCatalog.js";
import { verifyUnsubscribeToken } from "../lib/announcementUnsubscribe.js";
import { AppError } from "../lib/errors.js";
import { webAppUrl } from "../lib/webAppUrl.js";
import { isSafeLinkPath, normalizeLinkPath, type AnnouncementFilters } from "../services/announcementService.js";

const stripControl = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
const DEPARTMENT_CODES = new Set<string>(DEPARTMENTS.map((d) => d.code));

const filtersSchema = z
  .object({
    batchYears: z.array(z.number().int().min(1960).max(2100)).max(150).optional(),
    departmentCodes: z
      .array(z.string().refine((c) => DEPARTMENT_CODES.has(c), "Unknown department."))
      .max(DEPARTMENTS.length)
      .optional(),
    placeIds: z.array(z.string().uuid()).max(50).optional()
  })
  .default({});

const contentSchema = z.object({
  title: z.string().transform(stripControl).pipe(z.string().trim().min(1).max(120)),
  // Newlines and tabs are kept (stripControl leaves \t \n \r); other control characters go.
  body: z.string().transform(stripControl).pipe(z.string().trim().min(1).max(2000)),
  linkPath: z
    .string()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => normalizeLinkPath(v))
    .refine((v) => v === null || isSafeLinkPath(v), "Links must be a page inside the app, e.g. /intent/career."),
  channels: z.enum(["in_app", "email", "both"])
});

const previewBody = z.object({ filters: filtersSchema });
const sendBody = contentSchema.extend({ filters: filtersSchema, confirmCount: z.number().int().min(0) });
const idParams = z.object({ id: z.string().uuid() });
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const tokenSchema = z.object({ token: z.string().min(10).max(200) });

function bad(message: string): AppError {
  return new AppError(400, "ANNOUNCEMENT_BAD_REQUEST", message);
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid announcement.";
}

/**
 * Admin announcements (in-app, email or both, to members filtered by batch / department / city),
 * plus the public unsubscribe endpoints used by the links in announcement emails.
 */
export const announcementRoutes: FastifyPluginAsync = async (app) => {
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };
  const service = () => app.announcementService;

  // Mail apps send one-click unsubscribes as a form post (RFC 8058). Only this plugin reads form bodies.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.post("/v1/admin/announcements/preview", admin, async (request, reply) => {
    const parsed = previewBody.safeParse(request.body ?? {});
    if (!parsed.success) throw bad(firstIssue(parsed.error));
    return reply.code(200).send(await service().preview(parsed.data.filters as AnnouncementFilters));
  });

  app.post("/v1/admin/announcements/test", admin, async (request, reply) => {
    const parsed = contentSchema.safeParse(request.body);
    if (!parsed.success) throw bad(firstIssue(parsed.error));
    const announcement = await service().sendTest(request.actor.personId, parsed.data);
    return reply.code(201).send({ announcement });
  });

  app.post("/v1/admin/announcements", admin, async (request, reply) => {
    const parsed = sendBody.safeParse(request.body);
    if (!parsed.success) throw bad(firstIssue(parsed.error));
    const { filters, confirmCount, ...content } = parsed.data;
    const result = await service().send(request.actor.personId, content, filters as AnnouncementFilters, confirmCount);
    if (result.kind === "count_changed") {
      return reply.code(409).send({
        code: "ANNOUNCEMENT_COUNT_CHANGED",
        message: `The number of matching members changed to ${result.count}. Check and confirm again.`,
        count: result.count
      });
    }
    return reply.code(201).send({ announcement: result.announcement });
  });

  app.get("/v1/admin/announcements", admin, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) throw bad("Invalid history query.");
    return reply.code(200).send({ announcements: await service().list(query.data.limit) });
  });

  app.get("/v1/admin/announcements/:id", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const announcement = params.success ? await service().detail(params.data.id) : null;
    if (!announcement) throw new AppError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
    return reply.code(200).send({ announcement });
  });

  /* ---------------- Unsubscribe (no sign-in; the signed token is the proof) ---------------- */

  const personFromToken = (raw: unknown): string => {
    const parsed = tokenSchema.safeParse(raw);
    const personId = parsed.success ? verifyUnsubscribeToken(parsed.data.token) : null;
    if (!personId) {
      throw new AppError(400, "ANNOUNCEMENT_UNSUBSCRIBE_INVALID", "This unsubscribe link isn't valid.");
    }
    return personId;
  };

  // The email's link: never changes anything by itself (mail scanners open links), it opens the web page
  // that confirms the unsubscribe.
  app.get("/v1/announcements/unsubscribe", async (request, reply) => {
    const parsed = tokenSchema.safeParse(request.query);
    const token = parsed.success ? parsed.data.token : "";
    return reply.redirect(`${webAppUrl()}/unsubscribe?token=${encodeURIComponent(token)}`, 303);
  });

  // The web page (token in the JSON body) and one-click unsubscribe from mail apps (token in the query).
  app.post("/v1/announcements/unsubscribe", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const personId = personFromToken({ token: body.token ?? query.token });
    await service().setEmailOptOut(personId, true);
    return reply.code(200).send({ unsubscribed: true });
  });

  app.post("/v1/announcements/resubscribe", async (request, reply) => {
    const personId = personFromToken(request.body ?? {});
    await service().setEmailOptOut(personId, false);
    return reply.code(200).send({ unsubscribed: false });
  });
};
