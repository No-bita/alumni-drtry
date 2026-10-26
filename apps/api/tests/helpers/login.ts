import type { createApp } from "../../src/app.js";

type App = Awaited<ReturnType<typeof createApp>>;

export const SESSION_COOKIE = "alumni_session";

/** Magic-link login through the real auth routes; returns the Cookie header value and person id. */
export async function loginForTest(app: App, email: string): Promise<{ cookie: string; personId: string }> {
  const start = await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: email } });
  const link = new URL((start.json() as { debug: { magicLinkUrl: string } }).debug.magicLinkUrl);
  const verify = await app.inject({
    method: "GET",
    url: `/v1/auth/verify?challengeId=${encodeURIComponent(link.searchParams.get("challengeId")!)}&magicLinkToken=${encodeURIComponent(link.searchParams.get("magicLinkToken")!)}`
  });
  const raw = verify.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0]! : String(raw);
  const value = header.slice(header.indexOf(`${SESSION_COOKIE}=`) + SESSION_COOKIE.length + 1).split(";")[0]!;
  const me = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `${SESSION_COOKIE}=${value}` } });
  return { cookie: `${SESSION_COOKIE}=${value}`, personId: (me.json() as { person: { personId: string } }).person.personId };
}
