import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateOtp(length = 6): string {
  const digits = "0123456789";
  let output = "";
  for (let i = 0; i < length; i += 1) {
    const byte = randomBytes(1)[0] ?? 0;
    output += digits[byte % digits.length];
  }
  return output;
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashSecret(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

export function verifySecret(secret: string, hashHex: string, pepper: string): boolean {
  const received = Buffer.from(hashSecret(secret, pepper), "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}

