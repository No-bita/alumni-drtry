import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      APP_BASE_URL: "http://localhost:4000",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://localhost:5432/alumni_test",
      AUTH_SECRET_PEPPER: process.env.AUTH_SECRET_PEPPER ?? "test_pepper_min_16_chars",
      ALLOWED_EMAIL_DOMAINS: "iitbhu.ac.in,itbhu.ac.in",
      EMAIL_PROVIDER: "console",
      SHOW_AUTH_SECRETS_IN_RESPONSE: "true",
      // Raise per-IP limit so the full suite can run without flakiness. Production uses default (20).
      // Per-email limit is unchanged so rate-limit behavior is still tested.
      AUTH_START_MAX_PER_IP_WINDOW: "200",
    }
  }
});
