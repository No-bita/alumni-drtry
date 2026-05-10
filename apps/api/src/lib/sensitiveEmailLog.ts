import { createHash } from "node:crypto";

/**
 * Fingerprint for logs and operator consoles — avoids emitting full allowlist/login emails into
 * aggregated logging sinks (CI, hosted log drains). Emails on admin/beta allowlists are PII.
 */
export function emailFingerprintForLog(normalizedEmail: string): string {
  const trimmed = normalizedEmail.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  const domain = at > 0 ? trimmed.slice(at + 1) : "?";
  const fp = createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
  return `sha256:${fp} domain:${domain}`;
}
