import { Pool } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  application_name: "alumni-phase1-api",
  max: 20,
  idleTimeoutMillis: 30_000
});

