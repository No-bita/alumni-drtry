import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { AppError, isAppError } from "./lib/errors.js";
import { captureException } from "./lib/sentry.js";
import { pool } from "./db/pool.js";
import { adminMetricsRoutes } from "./routes/adminMetricsRoutes.js";
import { adminOrgRoutes } from "./routes/adminOrgRoutes.js";
import { adminPeopleRoutes } from "./routes/adminPeopleRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { connectionThreadRoutes } from "./routes/connectionThreadRoutes.js";
import { contactRequestRoutes } from "./routes/contactRequestRoutes.js";
import { discoveryRoutes } from "./routes/discoveryRoutes.js";
import { intentcastRoutes } from "./routes/intentcastRoutes.js";
import { meRoutes } from "./routes/meRoutes.js";
import { notificationRoutes } from "./routes/notificationRoutes.js";
import { orgRoutes } from "./routes/orgRoutes.js";
import { AuthService } from "./services/authService.js";
import { ConnectionThreadService } from "./services/connectionThreadService.js";
import { ContactRequestService } from "./services/contactRequestService.js";
import { DiscoveryService } from "./services/discoveryService.js";
import { ConsoleEmailSender, ResendEmailSender, type EmailSender } from "./services/emailSender.js";
import { IntentcastService } from "./services/intentcastService.js";
import { NotificationService } from "./services/notificationService.js";
import { LinkService } from "./services/linkService.js";
import { OccupationService } from "./services/occupationService.js";
import { AdminMetricsService } from "./services/adminMetricsService.js";
import { AdminPeopleService } from "./services/adminPeopleService.js";
import { OrganizationService } from "./services/organizationService.js";
import { ProfileService } from "./services/profileService.js";

function buildEmailSender(): EmailSender {
  if (env.EMAIL_PROVIDER === "resend") {
    return new ResendEmailSender({
      apiKey: env.RESEND_API_KEY!,
      from: env.EMAIL_FROM!,
      brandName: env.EMAIL_BRAND_NAME,
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {})
    });
  }
  return new ConsoleEmailSender();
}

export async function createApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  await app.register(cookie);
  await app.register(cors, {
    origin:
      env.CORS_ORIGIN === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    credentials: true
  });

  const emailSender = buildEmailSender();
  const authService = new AuthService(pool, emailSender);
  const profileService = new ProfileService(pool);
  const occupationService = new OccupationService(pool);
  const linkService = new LinkService(pool);
  const organizationService = new OrganizationService(pool);
  const discoveryService = new DiscoveryService(pool);
  const intentcastService = new IntentcastService(pool, emailSender, env.INTENTCAST_AUTHOR_DELETE_RETENTION_DAYS);
  const contactRequestService = new ContactRequestService(pool, emailSender);
  const connectionThreadService = new ConnectionThreadService(pool, emailSender);
  const notificationService = new NotificationService(pool);
  const adminPeopleService = new AdminPeopleService(pool);
  const adminMetricsService = new AdminMetricsService(pool);
  app.decorate("authService", authService);
  app.decorate("profileService", profileService);
  app.decorate("occupationService", occupationService);
  app.decorate("linkService", linkService);
  app.decorate("organizationService", organizationService);
  app.decorate("discoveryService", discoveryService);
  app.decorate("intentcastService", intentcastService);
  app.decorate("contactRequestService", contactRequestService);
  app.decorate("connectionThreadService", connectionThreadService);
  app.decorate("notificationService", notificationService);
  app.decorate("adminPeopleService", adminPeopleService);
  app.decorate("adminMetricsService", adminMetricsService);

  app.decorate("authenticate", async (request, _reply) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      const actor = await app.authService.getActorFromSessionToken(token);
      if (actor) {
        request.actor = actor;
        return;
      }
    }

    if (
      env.AUTH_BYPASS_SUPER_ADMIN &&
      env.AUTH_BYPASS_SUPER_ADMIN_EMAIL &&
      env.NODE_ENV !== "production"
    ) {
      const actor = await app.authService.getActorByInstitutionalEmail(env.AUTH_BYPASS_SUPER_ADMIN_EMAIL);
      if (actor && actor.role === "super_admin") {
        request.actor = actor;
        return;
      }
    }

    throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required.");
  });

  app.decorate("requireAdmin", async (request, _reply) => {
    if (request.actor.role !== "admin" && request.actor.role !== "super_admin") {
      throw new AppError(403, "AUTH_FORBIDDEN", "Admin access required.");
    }
  });

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(discoveryRoutes);
  await app.register(intentcastRoutes);
  await app.register(contactRequestRoutes);
  await app.register(connectionThreadRoutes);
  await app.register(notificationRoutes);
  await app.register(orgRoutes);
  await app.register(adminOrgRoutes);
  await app.register(adminPeopleRoutes);
  await app.register(adminMetricsRoutes);

  app.get("/healthz", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return reply.code(200).send({ status: "ok", db: "ok" });
    } catch (err) {
      _request.log.warn({ err }, "Health check: database unreachable");
      return reply.code(503).send({ status: "degraded", db: "error" });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      const code = error.statusCode;
      const payload = { code: error.code, message: error.message };
      if (code === 429 && error.retryAfterSeconds != null) {
        return reply.code(code).header("Retry-After", String(error.retryAfterSeconds)).send(payload);
      }
      return reply.code(code).send(payload);
    }
    request.log.error({ err: error }, "Unhandled error");
    captureException(error, {
      reqId: request.id,
      method: request.method,
      url: request.url
    });
    return reply.code(500).send({
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong."
    });
  });

  return app;
}
