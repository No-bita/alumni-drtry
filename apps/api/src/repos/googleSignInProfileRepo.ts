import type { DbExecutor } from "../db/types.js";

export interface GoogleSignInProfileRow {
  id: string;
  person_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/** The only Google userinfo claims retained, per product decision. Anything else Google adds is dropped. */
export const RETAINED_CLAIMS = [
  "sub",
  "email",
  "email_verified",
  "name",
  "given_name",
  "family_name",
  "picture",
  "locale"
] as const;

/**
 * Stores the latest basic Google profile claims per member, replaced at each successful
 * Google sign-in. Kept apart from the editable/frozen Alma Mater profile: nothing here
 * feeds people.* or profile display, and no claim overwrites member-edited or frozen fields.
 * Only RETAINED_CLAIMS are stored - access tokens, ID tokens, authorization codes, secrets
 * and any unexpected future claim are dropped here even if passed in.
 */
export class GoogleSignInProfileRepo {
  constructor(private readonly db: DbExecutor) {}

  async upsert(input: {
    personId: string;
    claims: Record<string, unknown>;
  }): Promise<GoogleSignInProfileRow> {
    const payload: Record<string, unknown> = {};
    for (const key of RETAINED_CLAIMS) {
      if (key in input.claims) {
        payload[key] = input.claims[key];
      }
    }
    const result = await this.db.query<GoogleSignInProfileRow>(
      `
      INSERT INTO google_signin_profiles (person_id, payload)
      VALUES ($1, $2)
      ON CONFLICT (person_id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
      RETURNING *
      `,
      [input.personId, JSON.stringify(payload)]
    );
    return result.rows[0]!;
  }
}
