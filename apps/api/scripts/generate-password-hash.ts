import { createHmac } from "node:crypto";

function usage(): never {
  console.error("Usage: npm run auth:hash-password -- \"your-password\"");
  console.error("Requires AUTH_SECRET_PEPPER in environment.");
  process.exit(1);
}

const passwordArg = process.argv[2];
if (!passwordArg) {
  usage();
}

const pepper = process.env.AUTH_SECRET_PEPPER;
if (!pepper) {
  console.error("Missing AUTH_SECRET_PEPPER in environment.");
  process.exit(1);
}

const hash = createHmac("sha256", pepper).update(passwordArg).digest("hex");
console.log(hash);
