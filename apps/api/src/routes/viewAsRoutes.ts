import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { VIEW_AS_COOKIE_NAME, VIEW_AS_END_PATH, VIEW_AS_SWITCH_PATH, clearViewAsCookie, setViewAsCookie } from "../lib/viewAs.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120)
});

const startBodySchema = z.object({
  personId: z.string().uuid()
});

/**
 * Admin "view as member" (testing only). Only admins on VIEW_AS_ADMIN_EMAILS; read-only while active
 * (see the onRequest guard in app.ts). Every start and end is written to admin_view_as_audit and logged.
 */
export const viewAsRoutes: FastifyPluginAsync = async (app) => {
  const viewAsAdmin = { preHandler: [app.requireViewAsAdmin] };

  /** Find a member by name or sign-in email. */
  app.get("/v1/admin/view-as/people", viewAsAdmin, async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "VIEW_AS_BAD_REQUEST", "Type at least 2 characters of a name or email.");
    }
    reply.header("Cache-Control", "no-store");
    const people = await app.viewAsService.searchPeople(parsed.data.q, request.actor);
    return reply.code(200).send({ people });
  });

  /** Start viewing as a member. Refused (read-only guard) while another view-as session is active. */
  app.post("/v1/admin/view-as", viewAsAdmin, async (request, reply) => {
    const parsed = startBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "VIEW_AS_BAD_REQUEST", "Pick a member.");
    }
    const ip = request.ip ?? null;
    const { token, info } = await app.viewAsService.start({
      admin: request.actor,
      targetPersonId: parsed.data.personId,
      ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    request.log.warn(
      {
        viewAs: {
          event: "start",
          sessionId: info.sessionId,
          adminPersonId: info.adminPersonId,
          targetPersonId: info.targetPersonId,
          expiresAt: info.expiresAt,
          ip
        }
      },
      "admin view-as started"
    );
    setViewAsCookie(reply, token, app.viewAsService.sessionTtlMinutes);
    return reply.code(201).send({ viewAs: info });
  });

  /**
   * Switch to another member: ends the current view-as session (if any) and starts one for this member,
   * in one step. Allowed while view-as is active (the read-only guard lets it through), but only for an
   * allowlisted admin, checked against the real admin, never the member being viewed.
   */
  app.post(VIEW_AS_SWITCH_PATH, viewAsAdmin, async (request, reply) => {
    const parsed = startBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "VIEW_AS_BAD_REQUEST", "Pick a member.");
    }
    const ip = request.ip ?? null;
    const current = request.cookies[VIEW_AS_COOKIE_NAME];
    const { token, info, endedSessionId } = await app.viewAsService.switchTo({
      admin: request.actor,
      currentToken: typeof current === "string" && current.length > 0 ? current : null,
      targetPersonId: parsed.data.personId,
      ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    request.log.warn(
      {
        viewAs: {
          event: "switch",
          endedSessionId,
          sessionId: info.sessionId,
          adminPersonId: info.adminPersonId,
          targetPersonId: info.targetPersonId,
          expiresAt: info.expiresAt,
          ip
        }
      },
      "admin view-as switched"
    );
    setViewAsCookie(reply, token, app.viewAsService.sessionTtlMinutes);
    return reply.code(201).send({ viewAs: info });
  });

  /**
   * End view-as and go back to your own account. Needs only the view-as cookie (so it works even if the
   * admin lost access meanwhile); always clears the cookie.
   */
  app.post(VIEW_AS_END_PATH, async (request, reply) => {
    const token = request.cookies[VIEW_AS_COOKIE_NAME];
    let ended = false;
    if (typeof token === "string" && token.length > 0) {
      const ip = request.ip ?? null;
      const row = await app.viewAsService.end(token, ip, request.headers["user-agent"] ?? null);
      if (row) {
        ended = true;
        request.log.warn(
          {
            viewAs: {
              event: "end",
              sessionId: row.id,
              adminPersonId: row.admin_person_id,
              targetPersonId: row.target_person_id,
              ip
            }
          },
          "admin view-as ended"
        );
      }
    }
    clearViewAsCookie(reply);
    return reply.code(200).send({ ended });
  });
};
