import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { env } from "./config/env.js";
import { AppError, isAppError } from "./lib/errors.js";
import { captureException } from "./lib/sentry.js";
import { pool } from "./db/pool.js";
import { adminMetricsRoutes } from "./routes/adminMetricsRoutes.js";
import { adminLocationCleanupRoutes } from "./routes/adminLocationCleanupRoutes.js";
import { adminPlacesRoutes } from "./routes/adminPlacesRoutes.js";
import { adminCityReviewRoutes } from "./routes/adminCityReviewRoutes.js";
import { adminDepartmentOtherRoutes } from "./routes/adminDepartmentOtherRoutes.js";
import { campusMonthlyRoutes } from "./routes/campusMonthlyRoutes.js";
import { adminOrgRoutes } from "./routes/adminOrgRoutes.js";
import { adminPeopleRoutes } from "./routes/adminPeopleRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { connectionThreadRoutes } from "./routes/connectionThreadRoutes.js";
import { contactRequestRoutes } from "./routes/contactRequestRoutes.js";
import { brokerRoutes } from "./routes/brokerRoutes.js";
import { brokerConversationRoutes } from "./routes/brokerConversationRoutes.js";
import { BrokerService } from "./services/brokerService.js";
import { BrokerConversationService } from "./services/brokerConversationService.js";
import { feedbackRoutes } from "./routes/feedbackRoutes.js";
import { discoveryRoutes } from "./routes/discoveryRoutes.js";
import { intentcastRoutes } from "./routes/intentcastRoutes.js";
import { matchRoutes } from "./routes/matchRoutes.js";
import { careersRoutes } from "./routes/careersRoutes.js";
import { CareersService } from "./services/careersService.js";
import { citiesRoutes } from "./routes/citiesRoutes.js";
import { CitiesService } from "./services/citiesService.js";
import { homeRoutes } from "./routes/homeRoutes.js";
import { meRoutes } from "./routes/meRoutes.js";
import { areaRoutes } from "./routes/areaRoutes.js";
import { notificationRoutes } from "./routes/notificationRoutes.js";
import { orgRoutes } from "./routes/orgRoutes.js";
import { AuthService, type SessionActor } from "./services/authService.js";
import { ConnectionThreadService } from "./services/connectionThreadService.js";
import { ContactRequestService } from "./services/contactRequestService.js";
import { DiscoveryService } from "./services/discoveryService.js";
import { MatchService } from "./services/matchService.js";
import { ConsoleEmailSender, ResendEmailSender, testEmailCapture, type EmailSender } from "./services/emailSender.js";
import { IntentcastService } from "./services/intentcastService.js";
import { NotificationService } from "./services/notificationService.js";
import { LinkService } from "./services/linkService.js";
import { PersonAreaService } from "./services/personAreaService.js";
import { OccupationService } from "./services/occupationService.js";
import { AdminMetricsService } from "./services/adminMetricsService.js";
import { AdminPeopleService } from "./services/adminPeopleService.js";
import { DepartmentOtherReviewRepo } from "./repos/departmentOtherReviewRepo.js";
import { AnnouncementService } from "./services/announcementService.js";
import { announcementRoutes } from "./routes/announcementRoutes.js";
import { AdminPlacesService } from "./services/adminPlacesService.js";
import { CampusMonthlyService } from "./services/campusMonthlyService.js";
import { HomeSummaryService } from "./services/homeSummaryService.js";
import { FeedbackService } from "./services/feedbackService.js";
import { AnalyticsService } from "./services/analyticsService.js";
import { CloudApiSender, RecordingSender, type WhatsAppSender } from "./whatsapp/client.js";
import { WhatsAppService } from "./whatsapp/service.js";
import { whatsappRoutes } from "./whatsapp/routes.js";
import { LocationCleanupService } from "./services/locationCleanupService.js";
import { OrganizationService } from "./services/organizationService.js";
import { ProfileService } from "./services/profileService.js";
import { STATE_CHANGING_METHODS, verifyCsrfOrigin } from "./lib/csrfProtection.js";
import {
  VIEW_AS_COOKIE_NAME,
  VIEW_AS_END_PATH,
  VIEW_AS_READ_ONLY_CODE,
  VIEW_AS_READ_ONLY_MESSAGE
} from "./lib/viewAs.js";
import { markViewAsRequest, runRequestContext } from "./lib/viewAsContext.js";
import { ViewAsService } from "./services/viewAsService.js";
import { viewAsRoutes } from "./routes/viewAsRoutes.js";
import { DiscoveryReadLimiter, type DiscoveryLimits } from "./lib/directoryAbuseLimiter.js";
import {
  LOG_REDACT_PATHS,
  applySecurityHeaders,
  pathOnly,
  requestLogSerializer,
  resolveTrustProxy,
  type TrustProxySetting
} from "./lib/requestHardening.js";

function buildEmailSender(): EmailSender {
  if (env.NODE_ENV === "test") {
    // Tests capture auth emails in memory; no sign-in secrets in logs or API responses.
    return testEmailCapture;
  }
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

export type CreateAppOptions = {
  /** Tests: override WhatsApp wiring (sender, on/off, secrets) without touching the environment. */
  whatsapp?: { sender?: WhatsAppSender; enabled?: boolean; appSecret?: string; verifyToken?: string };
  /** Tests: override the discovery read limits (defaults come from the environment). */
  discoveryLimits?: Partial<DiscoveryLimits>;
  /** Tests: override TRUST_PROXY. */
  trustProxy?: TrustProxySetting;
  /** Tests: capture log lines. */
  logStream?: { write: (line: string) => void };
  /** Tests: override VIEW_AS_ADMIN_EMAILS / VIEW_AS_TTL_MINUTES. */
  viewAs?: { adminEmails?: string; ttlMinutes?: number };
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({
    // Real client IP behind Vercel and Render, so per-IP limits and session IPs aren't the proxy's.
    trustProxy: options.trustProxy ?? resolveTrustProxy(env.TRUST_PROXY, env.NODE_ENV),
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      // Path only (no query string: magic-link tokens, search terms, emails), no headers, no body.
      serializers: { req: requestLogSerializer },
      redact: { paths: LOG_REDACT_PATHS, censor: "[redacted]" },
      ...(options.logStream ? { stream: options.logStream } : {})
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    applySecurityHeaders(reply, env.NODE_ENV);
    return payload;
  });

  await app.register(cookie);
  await app.register(cors, {
    origin:
      env.CORS_ORIGIN === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    credentials: true
  });

  await app.register(multipart, {
    limits: {
      fileSize: 12 * 1024 * 1024,
      files: 2,
      fields: 12,
      parts: 24
    }
  });

  app.addHook("preHandler", async (request, _reply) => {
    verifyCsrfOrigin(request);
  });

  const emailSender = buildEmailSender();
  const authService = new AuthService(pool, emailSender);
  const profileService = new ProfileService(pool);
  const occupationService = new OccupationService(pool);
  const linkService = new LinkService(pool);
  const personAreaService = new PersonAreaService(pool);
  const organizationService = new OrganizationService(pool);
  const discoveryService = new DiscoveryService(pool);
  const adminPlacesService = new AdminPlacesService(pool);
  const locationCleanupService = new LocationCleanupService(pool, adminPlacesService);
  const intentcastService = new IntentcastService(pool, emailSender, env.INTENTCAST_AUTHOR_DELETE_RETENTION_DAYS);
  const contactRequestService = new ContactRequestService(pool, emailSender);
  const brokerService = new BrokerService(pool, emailSender);
  discoveryService.setReachOut(contactRequestService);
  const matchService = new MatchService(pool, null, contactRequestService);
  const whatsappEnabled = options.whatsapp?.enabled ?? env.WHATSAPP_ENABLED;
  const whatsappSender: WhatsAppSender =
    options.whatsapp?.sender ?? (env.WHATSAPP_ENABLED ? new CloudApiSender() : new RecordingSender());
  const whatsappService = new WhatsAppService(pool, whatsappSender, matchService, contactRequestService, whatsappEnabled);
  contactRequestService.setNoteChannel(whatsappService);
  brokerService.setAskChannel(whatsappService);
  whatsappService.setBrokerService(brokerService);
  profileService.setOnboardedListener((personId) => whatsappService.notifyOnboarded(personId));
  const connectionThreadService = new ConnectionThreadService(pool, emailSender);
  const announcementService = new AnnouncementService(pool, emailSender);
  const brokerConversationService = new BrokerConversationService(pool, emailSender);
  const notificationService = new NotificationService(pool, announcementService);
  // Due brokered requests close before notifications are read, so "no one was available" shows promptly.
  notificationService.setBeforeRead(() => brokerService.expireDue());
  const adminPeopleService = new AdminPeopleService(pool);
  const adminMetricsService = new AdminMetricsService(pool);
  const campusMonthlyService = new CampusMonthlyService(pool);
  const homeSummaryService = new HomeSummaryService(pool);
  const analyticsService = new AnalyticsService(pool);
  const feedbackService = new FeedbackService(pool);
  const citiesService = new CitiesService(pool, contactRequestService);
  profileService.setResidenceSync(citiesService);
  app.decorate("authService", authService);
  app.decorate("profileService", profileService);
  app.decorate("occupationService", occupationService);
  app.decorate("linkService", linkService);
  app.decorate("personAreaService", personAreaService);
  app.decorate("organizationService", organizationService);
  app.decorate("discoveryService", discoveryService);
  app.decorate("matchService", matchService);
  app.decorate("careersService", new CareersService(pool, contactRequestService));
  app.decorate("citiesService", citiesService);
  app.decorate("adminPlacesService", adminPlacesService);
  app.decorate("locationCleanupService", locationCleanupService);
  app.decorate("intentcastService", intentcastService);
  app.decorate("contactRequestService", contactRequestService);
  app.decorate("brokerService", brokerService);
  app.decorate("brokerConversationService", brokerConversationService);
  app.decorate("connectionThreadService", connectionThreadService);
  app.decorate("notificationService", notificationService);
  app.decorate("departmentOtherReview", new DepartmentOtherReviewRepo(pool));
  app.decorate("announcementService", announcementService);
  app.decorate("adminPeopleService", adminPeopleService);
  app.decorate("adminMetricsService", adminMetricsService);
  app.decorate("campusMonthlyService", campusMonthlyService);
  app.decorate("homeSummaryService", homeSummaryService);
  app.decorate("feedbackService", feedbackService);
  app.decorate("analyticsService", analyticsService);
  app.decorate("whatsappService", whatsappService);
  app.decorate("discoveryLimiter", new DiscoveryReadLimiter(pool, options.discoveryLimits));

  const viewAsService = new ViewAsService(pool, {
    adminEmails: options.viewAs?.adminEmails ?? env.VIEW_AS_ADMIN_EMAILS,
    ttlMinutes: options.viewAs?.ttlMinutes ?? env.VIEW_AS_TTL_MINUTES
  });
  app.decorate("viewAsService", viewAsService);

  /** The signed-in person themselves (session cookie, or a dev-only bypass). Never a viewed member. */
  const resolveRealActor = async (request: FastifyRequest): Promise<SessionActor | null> => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      const actor = await app.authService.getActorFromSessionToken(token);
      if (actor) {
        return actor;
      }
    }

    if (
      env.AUTH_BYPASS_SUPER_ADMIN &&
      env.AUTH_BYPASS_SUPER_ADMIN_EMAIL &&
      env.NODE_ENV !== "production"
    ) {
      const actor = await app.authService.getActorByInstitutionalEmail(env.AUTH_BYPASS_SUPER_ADMIN_EMAIL);
      if (actor && actor.role === "super_admin") {
        return actor;
      }
    }

    if (env.AUTH_BYPASS && env.AUTH_BYPASS_EMAIL && env.NODE_ENV !== "production") {
      const actor = await app.authService.getActorByInstitutionalEmail(env.AUTH_BYPASS_EMAIL);
      if (actor) {
        return actor;
      }
    }

    return null;
  };

  /** Admin view-as in force for this request: the real admin plus their own valid view-as cookie. */
  const resolveViewAs = async (request: FastifyRequest, real: SessionActor) => {
    const token = request.cookies[VIEW_AS_COOKIE_NAME];
    if (typeof token !== "string" || token.length === 0) return null;
    return viewAsService.resolve(token, real);
  };

  const isViewAsEndRequest = (request: FastifyRequest) =>
    pathOnly(request.routeOptions?.url ?? request.url) === VIEW_AS_END_PATH;

  // Each request gets its own context so code deep in services can tell a view-as request apart
  // (isViewAsRequest) and skip member side effects. Callback style so the rest of the request runs inside it.
  app.addHook("onRequest", (_request, _reply, done) => {
    runRequestContext(done);
  });

  // View-as is read-only. Runs before every route (whatever its own auth): a state-changing request made
  // while a view-as session is active is refused, except ending it. Only requests carrying the view-as
  // cookie pay for the lookup; a stale or someone else's cookie is ignored.
  app.addHook("onRequest", async (request) => {
    if (!STATE_CHANGING_METHODS.has(request.method)) return;
    const token = request.cookies?.[VIEW_AS_COOKIE_NAME];
    if (typeof token !== "string" || token.length === 0) return;
    if (isViewAsEndRequest(request)) return;
    const real = await resolveRealActor(request);
    if (!real) return;
    const viewAs = await resolveViewAs(request, real);
    if (!viewAs) return;
    request.log.warn(
      { viewAs: { adminPersonId: viewAs.info.adminPersonId, targetPersonId: viewAs.info.targetPersonId } },
      "view-as: write refused (read-only)"
    );
    throw new AppError(403, VIEW_AS_READ_ONLY_CODE, VIEW_AS_READ_ONLY_MESSAGE);
  });

  app.decorate("authenticate", async (request, _reply) => {
    const real = await resolveRealActor(request);
    if (!real) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required.");
    }
    const viewAs = await resolveViewAs(request, real);
    if (viewAs) {
      // Second line of defence behind the onRequest guard above.
      if (STATE_CHANGING_METHODS.has(request.method) && !isViewAsEndRequest(request)) {
        throw new AppError(403, VIEW_AS_READ_ONLY_CODE, VIEW_AS_READ_ONLY_MESSAGE);
      }
      request.actor = viewAs.actor;
      request.viewAs = viewAs.info;
      markViewAsRequest();
      return;
    }
    request.actor = real;
  });

  /** View-as admin routes act as the admin themselves, never as the member being viewed. */
  app.decorate("requireViewAsAdmin", async (request, _reply) => {
    const real = await resolveRealActor(request);
    if (!real) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required.");
    }
    viewAsService.assertCanUse(real);
    request.actor = real;
    const viewAs = await resolveViewAs(request, real);
    if (viewAs) request.viewAs = viewAs.info;
  });

  app.decorate("requireAdmin", async (request, _reply) => {
    if (request.actor.role !== "admin" && request.actor.role !== "super_admin") {
      throw new AppError(403, "AUTH_FORBIDDEN", "Admin access required.");
    }
  });

  app.decorate("requireSuperAdmin", async (request, _reply) => {
    if (request.actor.role !== "super_admin") {
      throw new AppError(403, "AUTH_FORBIDDEN", "Super admin access required.");
    }
  });

  app.decorate("requireNonDemoMutation", async (request, _reply) => {
    if (request.actor?.isDemo) {
      throw new AppError(403, "DEMO_READ_ONLY", "Demo accounts are read-only.");
    }
  });

  // Registered before any route plugin: Fastify gives each plugin the error handler in place when the
  // plugin is registered, so a handler set at the end never applied to the routes (they used Fastify's
  // default, which sent internal error text to clients and dropped Retry-After on 429s).
  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      const code = error.statusCode;
      const payload = { code: error.code, message: error.message };
      if (code === 429 && error.retryAfterSeconds != null) {
        return reply.code(code).header("Retry-After", String(error.retryAfterSeconds)).send(payload);
      }
      return reply.code(code).send(payload);
    }
    // Fastify's own client errors (bad JSON, unsupported media type, body too large, ...): keep the status.
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({
        code: (error as { code?: string }).code ?? "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Bad request."
      });
    }
    request.log.error({ err: error }, "Unhandled error");
    captureException(error, {
      reqId: request.id,
      method: request.method,
      url: pathOnly(request.url)
    });
    return reply.code(500).send({
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong."
    });
  });

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(areaRoutes);
  await app.register(discoveryRoutes);
  await app.register(matchRoutes);
  await app.register(careersRoutes);
  await app.register(citiesRoutes);
  await app.register(homeRoutes);
  await app.register(whatsappRoutes, {
    service: whatsappService,
    enabled: whatsappEnabled,
    appSecret: options.whatsapp?.appSecret ?? env.WA_APP_SECRET,
    verifyToken: options.whatsapp?.verifyToken ?? env.WA_VERIFY_TOKEN
  });
  await app.register(intentcastRoutes);
  await app.register(contactRequestRoutes);
  await app.register(brokerRoutes);
  await app.register(brokerConversationRoutes);
  await app.register(connectionThreadRoutes);
  await app.register(notificationRoutes);
  await app.register(orgRoutes);
  await app.register(adminOrgRoutes);
  await app.register(adminPeopleRoutes);
  await app.register(viewAsRoutes);
  await app.register(adminPlacesRoutes);
  await app.register(adminLocationCleanupRoutes);
  await app.register(adminCityReviewRoutes);
  await app.register(adminDepartmentOtherRoutes);
  await app.register(announcementRoutes);
  await app.register(adminMetricsRoutes);
  await app.register(campusMonthlyRoutes);
  await app.register(feedbackRoutes);

  app.get("/", async (_request, reply) =>
    reply.code(200).send({
      service: "alumni-platform-api",
      healthz: "/healthz",
      apiPrefix: "/v1"
    })
  );

  const healthHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await pool.query("SELECT 1");
      return reply.code(200).send({ status: "ok", db: "ok" });
    } catch (err) {
      _request.log.warn({ err }, "Health check: database unreachable");
      return reply.code(503).send({ status: "degraded", db: "error" });
    }
  };
  app.get("/healthz", healthHandler);
  // Same check under /v1 so the web app can warm the API through its same-origin /v1 proxy.
  app.get("/v1/healthz", healthHandler);

  return app;
}
