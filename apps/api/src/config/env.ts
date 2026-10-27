import { z } from "zod";
import { environmentBoolean } from "../lib/environmentBoolean.js";
import { validateProductionCorsOrigin } from "../lib/productionCors.js";

const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    return trimmed;
  }
  return value;
}, z.string().email().optional());

const optionalStringSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    return trimmed;
  }
  return value;
}, z.string().optional());

/** Railway/UI often paste `myapp.vercel.app`, quoted values, or stray spaces — normalize before z.string().url(). */
function preprocessOptionalHttpOrigin(v: unknown): string | undefined {
  if (typeof v !== "string") {
    return undefined;
  }
  let t = v.trim();
  if (t === "") {
    return undefined;
  }
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t === "") {
    return undefined;
  }
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }
  t = t.replace(/\/+$/, "");
  return t;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_BASE_URL: z.string().url(),
  MAGIC_LINK_BASE_URL: z.preprocess(preprocessOptionalHttpOrigin, z.string().url().optional()),
  DATABASE_URL: z.string().min(1),
  /** Max clients in the process pool. With Neon PgBouncer, keep this modest per instance (e.g. 5–10). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),
  /** 0 disables server-side cutoff for directory search. */
  DISCOVERY_SEARCH_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).max(120_000).default(15_000),
  /** When true, extract dept / graduation year / known employer tokens from `q` and merge into structured params. */
  DISCOVERY_NORMALIZE_QUERY: z.coerce.boolean().default(false),
  /** Persist directory search sessions + optional click events (set false to skip DB writes in tests if needed). */
  DISCOVERY_ANALYTICS_ENABLED: z.coerce.boolean().default(true),
  /** Ask → Match: try an LLM question parser before the rules parser (needs a provider; off by default). */
  MATCH_LLM_ENABLED: environmentBoolean.default(false),
  /** Ask → Match: write privacy-safe query stats (category, field names, result count) to match_queries. */
  MATCH_ANALYTICS_ENABLED: environmentBoolean.default(true),
  ALLOWED_EMAIL_DOMAINS: z.string().default("iitbhu.ac.in,itbhu.ac.in"),
  SESSION_COOKIE_NAME: z.string().min(1).default("alumni_session"),
  /** Sliding window: on throttled activity, extend session expiry up to this many hours from "now". */
  SESSION_SLIDING_HOURS: z.coerce.number().int().min(1).max(24 * 14).default(4),
  /** Hard cap from `sessions.created_at`: session cannot outlive this many hours (default 48 = 2 days). */
  SESSION_HARD_CAP_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(48),
  /** Min seconds between DB writes that refresh `last_seen_at` / sliding `expires_at` (reduces load). */
  SESSION_TOUCH_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(120),
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  AUTH_CHALLENGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(15).default(5),
  AUTH_START_MAX_PER_EMAIL_WINDOW: z.coerce.number().int().min(1).max(20).default(3),
  AUTH_START_MAX_PER_IP_WINDOW: z.coerce.number().int().min(1).max(200).default(20),
  AUTH_START_WINDOW_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  AUTH_START_DUPLICATE_WINDOW_SECONDS: z.coerce.number().int().min(0).max(600).default(120),
  AUTH_SECRET_PEPPER: z.string().min(16),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: optionalEmailSchema,
  EMAIL_REPLY_TO: optionalEmailSchema,
  EMAIL_BRAND_NAME: z.string().min(1).default("Alma Mater"),
  RESEND_API_KEY: optionalStringSchema,
  COOKIE_DOMAIN: optionalStringSchema,
  SHOW_AUTH_SECRETS_IN_RESPONSE: environmentBoolean.default(false),
  CORS_ORIGIN: z.string().default("*"),
  SENTRY_DSN: optionalStringSchema,
  /**
   * Development/staging only: authenticate API requests as the super_admin person with this email
   * when no session cookie is present. Blocked when NODE_ENV=production.
   */
  AUTH_BYPASS_SUPER_ADMIN: environmentBoolean.default(false),
  AUTH_BYPASS_SUPER_ADMIN_EMAIL: optionalEmailSchema,
  /**
   * Development only: treat unauthenticated API requests as this person (any role).
   * Blocked when NODE_ENV=production.
   */
  AUTH_BYPASS: environmentBoolean.default(false),
  AUTH_BYPASS_EMAIL: optionalEmailSchema,
  /** Days author keeps a soft-deleted bulletin post + replies before hard delete. */
  INTENTCAST_AUTHOR_DELETE_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  /**
   * In-process intentcast expiry/purge interval (ms). If unset: off except production defaults to 1h.
   * Set to `0` to disable the scheduler in production (use an external cron instead).
   */
  INTENTCAST_EXPIRY_SCHEDULER_MS: z.coerce.number().int().min(0).max(86_400_000).optional(),
  /** Contact-request reminder emails: interval in ms (default hourly in production, off elsewhere; 0 = off). */
  CONTACT_REQUEST_REMINDER_SCHEDULER_MS: z.coerce.number().int().min(0).max(86_400_000).optional(),

  /** Max contact requests a sender may create within CONTACT_REQUEST_WINDOW_MINUTES. 0 = no limit. */
  CONTACT_REQUEST_MAX_PER_SENDER_WINDOW: z.coerce.number().int().min(0).max(500).default(25),
  /** Rolling window (minutes) for CONTACT_REQUEST_MAX_PER_SENDER_WINDOW. */
  CONTACT_REQUEST_WINDOW_MINUTES: z.coerce.number().int().min(1).max(10_080).default(1440),

  /**
   * Max combined directory reads per user per window: GET /v1/search, /v1/profiles/:id, /v1/directory/residence-cities.
   * In-memory per API instance. 0 = disable.
   */
  DISCOVERY_READ_MAX_PER_USER_WINDOW: z.coerce.number().int().min(0).max(50_000).default(150),
  DISCOVERY_READ_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  /** Same window as DISCOVERY_READ_WINDOW_MINUTES; 0 = disable IP bucket. */
  DISCOVERY_READ_MAX_PER_IP_WINDOW: z.coerce.number().int().min(0).max(200_000).default(0),

  /** OAuth 2.0 client from Google Cloud Console. Both required to enable Sign in with Google. */
  GOOGLE_CLIENT_ID: optionalStringSchema,
  GOOGLE_CLIENT_SECRET: optionalStringSchema,
  /**
   * Optional. Passed to Google as OAuth `hd` (single Google Workspace domain). Nudges the account picker;
   * enforcement of allowed addresses is still ALLOWED_EMAIL_DOMAINS on the API after sign-in.
   */
  GOOGLE_OAUTH_HOSTED_DOMAIN: optionalStringSchema,
  BETA_INVITE_AUTH_ENABLED: environmentBoolean.default(false),
  BETA_REQUIRE_ALLOWLIST: z.coerce.boolean().default(true),
  BETA_SHARED_INVITE_CODE_HASH: optionalStringSchema,
  BETA_SHARED_INVITE_CODE_ID: optionalStringSchema.default("shared-v1"),
  BETA_INVITE_MAX_PER_EMAIL_WINDOW: z.coerce.number().int().min(1).max(100).default(10),
  BETA_INVITE_MAX_PER_IP_WINDOW: z.coerce.number().int().min(1).max(1000).default(50),
  BETA_INVITE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(240).default(15),
  /**
   * Dev-only password fallback for one account.
   * Password is verified by comparing hashSecret(password, AUTH_SECRET_PEPPER) to DEV_PASSWORD_LOGIN_PASSWORD_HASH.
   */
  ENABLE_PASSWORD_LOGIN: environmentBoolean.default(false),
  DEV_PASSWORD_LOGIN_EMAIL: optionalEmailSchema.default("seed-admin-placeholder@example.invalid"),
  DEV_PASSWORD_LOGIN_PASSWORD_HASH: optionalStringSchema,
  /**
   * Shared demo login (email + password) for prospects and guided tours.
   * Default-off killswitch. Requires DEMO_AUTH_EMAIL and DEMO_AUTH_PASSWORD_HASH when enabled.
   */
  DEMO_AUTH_ENABLED: environmentBoolean.default(false),
  DEMO_AUTH_EMAIL: optionalEmailSchema,
  DEMO_AUTH_PASSWORD_HASH: optionalStringSchema,
  DEMO_AUTH_MAX_PER_IP_WINDOW: z.coerce.number().int().min(1).max(500).default(30),
  DEMO_AUTH_MAX_PER_ACCOUNT_WINDOW: z.coerce.number().int().min(1).max(500).default(60),
  DEMO_AUTH_WINDOW_MINUTES: z.coerce.number().int().min(1).max(120).default(15)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

if (parsed.data.EMAIL_PROVIDER === "resend") {
  const missing: string[] = [];
  if (!parsed.data.RESEND_API_KEY) {
    missing.push("RESEND_API_KEY");
  }
  if (!parsed.data.EMAIL_FROM) {
    missing.push("EMAIL_FROM");
  }
  if (missing.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${missing.join(", ")} required when EMAIL_PROVIDER=resend`
    );
  }
}

if (parsed.data.AUTH_BYPASS_SUPER_ADMIN) {
  if (parsed.data.NODE_ENV === "production") {
    throw new Error("Invalid environment: AUTH_BYPASS_SUPER_ADMIN cannot be enabled in production.");
  }
  if (!parsed.data.AUTH_BYPASS_SUPER_ADMIN_EMAIL) {
    throw new Error("Invalid environment: AUTH_BYPASS_SUPER_ADMIN_EMAIL is required when AUTH_BYPASS_SUPER_ADMIN=true.");
  }
}

if (parsed.data.AUTH_BYPASS) {
  if (parsed.data.NODE_ENV === "production") {
    throw new Error("Invalid environment: AUTH_BYPASS cannot be enabled in production.");
  }
  if (!parsed.data.AUTH_BYPASS_EMAIL) {
    throw new Error("Invalid environment: AUTH_BYPASS_EMAIL is required when AUTH_BYPASS=true.");
  }
}

validateProductionCorsOrigin(parsed.data.NODE_ENV, parsed.data.CORS_ORIGIN);

const hasGoogleId = Boolean(parsed.data.GOOGLE_CLIENT_ID);
const hasGoogleSecret = Boolean(parsed.data.GOOGLE_CLIENT_SECRET);
if (hasGoogleId !== hasGoogleSecret) {
  throw new Error(
    "Invalid environment: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or omit both to disable Google sign-in."
  );
}

if (parsed.data.BETA_INVITE_AUTH_ENABLED && !parsed.data.BETA_SHARED_INVITE_CODE_HASH) {
  throw new Error(
    "Invalid environment: BETA_SHARED_INVITE_CODE_HASH is required when BETA_INVITE_AUTH_ENABLED=true."
  );
}

if (parsed.data.DEMO_AUTH_ENABLED) {
  if (!parsed.data.DEMO_AUTH_EMAIL || !parsed.data.DEMO_AUTH_PASSWORD_HASH) {
    throw new Error(
      "Invalid environment: DEMO_AUTH_EMAIL and DEMO_AUTH_PASSWORD_HASH are required when DEMO_AUTH_ENABLED=true."
    );
  }
}

let googleOauthHostedDomain: string | undefined = parsed.data.GOOGLE_OAUTH_HOSTED_DOMAIN?.trim().toLowerCase();
if (googleOauthHostedDomain === "") {
  googleOauthHostedDomain = undefined;
}
if (googleOauthHostedDomain) {
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(googleOauthHostedDomain)) {
    throw new Error(
      "Invalid GOOGLE_OAUTH_HOSTED_DOMAIN: use a hostname like itbhu.ac.in (no @, no https://)."
    );
  }
}

export const env = { ...parsed.data, GOOGLE_OAUTH_HOSTED_DOMAIN: googleOauthHostedDomain };
export type Env = typeof env;
