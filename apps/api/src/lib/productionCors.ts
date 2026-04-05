/**
 * With `credentials: true`, wildcard CORS is unsafe and browsers may not behave as expected.
 * Production must list explicit origin(s).
 */
export function validateProductionCorsOrigin(nodeEnv: string, corsOrigin: string): void {
  if (nodeEnv !== "production") {
    return;
  }
  const corsOrigins = corsOrigin
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0 || corsOrigins.some((o) => o === "*")) {
    throw new Error(
      "Invalid environment: CORS_ORIGIN cannot be empty or * in production (credentials require explicit origin(s), e.g. https://app.example.com)."
    );
  }
}
