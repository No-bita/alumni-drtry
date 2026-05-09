/**
 * Print the env value for BETA_SHARED_INVITE_CODE_HASH (HMAC-SHA256 hex, same as auth invite verification).
 *
 *   AUTH_SECRET_PEPPER='your-pepper' npx tsx scripts/hash-beta-invite-code.ts <plaintext-invite-code>
 *
 * Or from Railway (same service as the API):
 *   railway run -- npx tsx scripts/hash-beta-invite-code.ts my-shared-code
 */
import { hashSecret } from "../src/lib/crypto.js";

const code = process.argv[2]?.trim();
const pepper = process.env.AUTH_SECRET_PEPPER?.trim();
if (!code) {
  console.error("Usage: AUTH_SECRET_PEPPER=... npx tsx scripts/hash-beta-invite-code.ts <invite-code-plaintext>");
  process.exit(1);
}
if (!pepper || pepper.length < 16) {
  console.error("AUTH_SECRET_PEPPER must be set (same value as production API) and at least 16 characters.");
  process.exit(1);
}

console.log(hashSecret(code, pepper));
