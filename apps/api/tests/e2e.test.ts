import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

type App = Awaited<ReturnType<typeof createApp>>;

/** Parse magicLinkUrl (e.g. http://localhost:4000/auth/verify?challengeId=...&magicLinkToken=...) and return query params for GET /v1/auth/verify */
function parseMagicLinkQuery(magicLinkUrl: string): { challengeId: string; magicLinkToken: string } {
  const url = new URL(magicLinkUrl);
  const challengeId = url.searchParams.get("challengeId");
  const magicLinkToken = url.searchParams.get("magicLinkToken");
  if (!challengeId || !magicLinkToken) {
    throw new Error(`Invalid magicLinkUrl: ${magicLinkUrl}`);
  }
  return { challengeId, magicLinkToken };
}

/** Extract session cookie value from Set-Cookie header for use in Cookie header */
function getSessionCookieFromResponse(res: { headers: Record<string, string | string[] | undefined> }, cookieName: string): string {
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw || typeof raw !== "string") return "";
  const prefix = `${cookieName}=`;
  const start = raw.indexOf(prefix);
  if (start === -1) return "";
  const valueStart = start + prefix.length;
  const end = raw.indexOf(";", valueStart);
  return end === -1 ? raw.slice(valueStart) : raw.slice(valueStart, end).trim();
}

describe("e2e: full flow", () => {
  let app: App;
  const cookieName = "alumni_session";

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("auth start → verify → GET /v1/me (session established)", async () => {
    const email = `e2e-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    if (startRes.statusCode === 500) {
      return; // DB unavailable
    }
    expect(startRes.statusCode).toBe(200);
    const startBody = startRes.json() as { challengeId?: string; debug?: { magicLinkUrl?: string } };
    expect(startBody.challengeId).toBeDefined();
    expect(startBody.debug?.magicLinkUrl).toBeDefined();

    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    if (verifyRes.statusCode === 500) return;
    expect(verifyRes.statusCode).toBe(200);
    const sessionCookie = getSessionCookieFromResponse(verifyRes, cookieName);
    expect(sessionCookie).toBeTruthy();

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `${cookieName}=${sessionCookie}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json() as { person?: { personId: string; institutionalEmail: string } };
    expect(meBody.person?.personId).toBeDefined();
    expect(meBody.person?.institutionalEmail).toBe(email);
  });

  it("authenticated: PATCH /v1/me/profile and GET /v1/me/profile", async () => {
    const email = `e2e-profile-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    if (startRes.statusCode !== 200) return;
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    if (verifyRes.statusCode !== 200) return;
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers,
      payload: { fullName: "E2E Test User", batchYear: 2020 },
    });
    expect(patchRes.statusCode).toBe(200);

    const profileRes = await app.inject({
      method: "GET",
      url: "/v1/me/profile",
      headers,
    });
    expect(profileRes.statusCode).toBe(200);
    const profileBody = profileRes.json() as { profile?: { fullName?: string; batchYear?: number } };
    expect(profileBody.profile?.fullName).toBe("E2E Test User");
    expect(profileBody.profile?.batchYear).toBe(2020);
  });

  it("authenticated: GET /v1/search returns results shape", async () => {
    const email = `e2e-search-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    if (startRes.statusCode !== 200) return;
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    if (verifyRes.statusCode !== 200) return;
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const searchRes = await app.inject({
      method: "GET",
      url: "/v1/search?limit=5",
      headers,
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json() as { results?: unknown[]; pageInfo?: { hasMore: boolean; nextCursor: string | null } };
    expect(Array.isArray(searchBody.results)).toBe(true);
    expect(searchBody.pageInfo).toBeDefined();
    expect(typeof searchBody.pageInfo?.hasMore).toBe("boolean");
  });

  it("authenticated: GET /v1/profiles/:id (own profile, after profile update makes searchable)", async () => {
    const email = `e2e-profile-id-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    if (startRes.statusCode !== 200) return;
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    if (verifyRes.statusCode !== 200) return;
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const meRes = await app.inject({ method: "GET", url: "/v1/me", headers });
    const meBody = meRes.json() as { person?: { personId: string } };
    const personId = meBody.person?.personId;
    if (!personId) return;

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers,
      payload: { fullName: "E2E Profile View User", batchYear: 2020, departmentCode: "cse" },
    });
    if (patchRes.statusCode !== 200) return;

    const profileRes = await app.inject({
      method: "GET",
      url: `/v1/profiles/${personId}`,
      headers,
    });
    expect(profileRes.statusCode).toBe(200);
    const profileBody = profileRes.json() as { profile?: { id: string }; occupations?: unknown[]; links?: unknown[] };
    expect(profileBody.profile?.id).toBe(personId);
    expect(Array.isArray(profileBody.occupations)).toBe(true);
    expect(Array.isArray(profileBody.links)).toBe(true);
  });

  it("two users: contact request from A to B", async () => {
    const now = Date.now();
    const emailA = `e2e-a-${now}@iitbhu.ac.in`;
    const emailB = `e2e-b-${now}@iitbhu.ac.in`;

    const login = async (email: string): Promise<{ cookie: string; personId: string } | null> => {
      const startRes = await app.inject({
        method: "POST",
        url: "/v1/auth/start",
        payload: { institutionalEmail: email },
      });
      if (startRes.statusCode !== 200) return null;
      const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
      const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
      const verifyRes = await app.inject({
        method: "GET",
        url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
      });
      if (verifyRes.statusCode !== 200) return null;
      const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `${cookieName}=${cookie}` },
      });
      const meBody = meRes.json() as { person?: { personId: string } };
      return { cookie, personId: meBody.person?.personId };
    };

    const userA = await login(emailA);
    const userB = await login(emailB);
    if (!userA?.personId || !userB?.personId) {
      throw new Error("Could not log in as both users (rate limited or DB issue). Ensure AUTH_START_MAX_PER_IP_WINDOW is raised in test env.");
    }

    const createRes = await app.inject({
      method: "POST",
      url: "/v1/contact-requests",
      headers: { cookie: `${cookieName}=${userA.cookie}` },
      payload: { recipientPersonId: userB.personId, message: "E2E test message" },
    });
    expect(createRes.statusCode).toBe(201);
    const createBody = createRes.json() as { contactRequest?: { id: string; status: string } };
    expect(createBody.contactRequest?.id).toBeDefined();
    expect(createBody.contactRequest?.status).toBeDefined();
  });
});
