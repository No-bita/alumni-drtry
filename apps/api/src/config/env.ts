import { z } from "zod";

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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_BASE_URL: z.string().url(),
  MAGIC_LINK_BASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional()
  ),
  DATABASE_URL: z.string().min(1),
  ALLOWED_EMAIL_DOMAINS: z.string().default("iitbhu.ac.in,itbhu.ac.in"),
  SESSION_COOKIE_NAME: z.string().min(1).default("alumni_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  AUTH_CHALLENGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(15).default(5),
  AUTH_START_MAX_PER_EMAIL_WINDOW: z.coerce.number().int().min(1).max(20).default(3),
  AUTH_START_MAX_PER_IP_WINDOW: z.coerce.number().int().min(1).max(200).default(20),
  AUTH_START_WINDOW_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  AUTH_SECRET_PEPPER: z.string().min(16),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: optionalEmailSchema,
  EMAIL_REPLY_TO: optionalEmailSchema,
  EMAIL_BRAND_NAME: z.string().min(1).default("IIT BHU Alumni Network"),
  RESEND_API_KEY: optionalStringSchema,
  COOKIE_DOMAIN: optionalStringSchema,
  SHOW_AUTH_SECRETS_IN_RESPONSE: z.coerce.boolean().default(false),
  CORS_ORIGIN: z.string().default("*"),
  SENTRY_DSN: optionalStringSchema
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.errors.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
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

export const env = parsed.data;
export type Env = typeof env;
