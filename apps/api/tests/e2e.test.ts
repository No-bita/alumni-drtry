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
    expect(startRes.statusCode).toBe(200);
    const startBody = startRes.json() as { challengeId?: string; debug?: { magicLinkUrl?: string } };
    expect(startBody.challengeId).toBeDefined();
    expect(startBody.debug?.magicLinkUrl).toBeDefined();

    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
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
    expect(startRes.statusCode, startRes.body).toBe(200);
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
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
    expect(startRes.statusCode, startRes.body).toBe(200);
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
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

  it("authenticated: GET /v1/directory/residence-cities returns cities array", async () => {
    const email = `e2e-res-cities-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    expect(startRes.statusCode, startRes.body).toBe(200);
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const res = await app.inject({
      method: "GET",
      url: "/v1/directory/residence-cities?limit=20",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { cities?: { city?: string; country?: string; count?: number }[] };
    expect(Array.isArray(body.cities)).toBe(true);
    for (const row of body.cities ?? []) {
      expect(typeof row.city).toBe("string");
      expect(typeof row.country).toBe("string");
      expect(typeof row.count).toBe("number");
      expect(row.count).toBeGreaterThan(0);
    }
  });

  it("authenticated: GET /v1/profiles/:id (own profile, after profile update makes searchable)", async () => {
    const email = `e2e-profile-id-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    expect(startRes.statusCode, startRes.body).toBe(200);
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const meRes = await app.inject({ method: "GET", url: "/v1/me", headers });
    const meBody = meRes.json() as { person?: { personId: string } };
    const personId = meBody.person?.personId;
    if (!personId) throw new Error("Login did not return personId");

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers,
      payload: { fullName: "E2E Profile View User", batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
    });
    expect(patchRes.statusCode, patchRes.body).toBe(200);

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
      expect(startRes.statusCode, startRes.body).toBe(200);
      const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
      const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
      const verifyRes = await app.inject({
        method: "GET",
        url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
      });
      expect(verifyRes.statusCode, verifyRes.body).toBe(200);
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

  it("authenticated: GET /v1/search rejects limit above max", async () => {
    const email = `e2e-search-limit-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    expect(startRes.statusCode, startRes.body).toBe(200);
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const searchRes = await app.inject({
      method: "GET",
      url: "/v1/search?limit=101",
      headers,
    });
    expect(searchRes.statusCode).toBe(400);
  });

  it("authenticated: search excludes viewer and finds other profile by keyword", async () => {
    const now = Date.now();
    const emailA = `e2e-sea-${now}@iitbhu.ac.in`;
    const emailB = `e2e-seb-${now}@iitbhu.ac.in`;
    const marker = `e2emarker${now}`;

    const login = async (e: string): Promise<{ cookie: string; personId: string } | null> => {
      const startRes = await app.inject({
        method: "POST",
        url: "/v1/auth/start",
        payload: { institutionalEmail: e },
      });
      expect(startRes.statusCode, startRes.body).toBe(200);
      const sb = startRes.json() as { debug?: { magicLinkUrl?: string } };
      const { challengeId, magicLinkToken } = parseMagicLinkQuery(sb.debug!.magicLinkUrl!);
      const verifyRes = await app.inject({
        method: "GET",
        url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
      });
      expect(verifyRes.statusCode, verifyRes.body).toBe(200);
      const ck = getSessionCookieFromResponse(verifyRes, cookieName);
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `${cookieName}=${ck}` },
      });
      const meBody = meRes.json() as { person?: { personId: string } };
      const personId = meBody.person?.personId;
      if (!personId) throw new Error("Login did not return personId");
      return { cookie: ck, personId };
    };

    const userA = await login(emailA);
    const userB = await login(emailB);
    if (!userA?.personId || !userB?.personId) throw new Error("Could not log in as both test users");

    const headersA = { cookie: `${cookieName}=${userA.cookie}` };
    const headersB = { cookie: `${cookieName}=${userB.cookie}` };

    const patchA = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: headersA,
      payload: { fullName: `E2E Alpha ${marker}`, batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
    });
    const patchB = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: headersB,
      payload: { fullName: `E2E Beta ${marker}`, batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
    });
    expect(patchA.statusCode, patchA.body).toBe(200);
    expect(patchB.statusCode, patchB.body).toBe(200);

    const searchRes = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(marker)}&limit=50`,
      headers: headersA,
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json() as { results?: { id: string }[] };
    const ids = (searchBody.results ?? []).map((r) => r.id);
    expect(ids).not.toContain(userA.personId);
    expect(ids).toContain(userB.personId);
  });

  it("authenticated: search keyset cursor returns a different row when hasMore", async () => {
    // Seed this test's own completed profiles, not rows left by another test.
    const marker = `cursorfixture${Date.now()}`;
    for (const label of ["Alpha", "Beta"]) {
      const start = await app.inject({
        method: "POST", url: "/v1/auth/start",
        payload: { institutionalEmail: `${label.toLowerCase()}-${marker}@iitbhu.ac.in` },
      });
      expect(start.statusCode, start.body).toBe(200);
      const link = start.json() as { debug?: { magicLinkUrl?: string } };
      const query = parseMagicLinkQuery(link.debug!.magicLinkUrl!);
      const verify = await app.inject({
        method: "GET",
        url: `/v1/auth/verify?challengeId=${encodeURIComponent(query.challengeId)}&magicLinkToken=${encodeURIComponent(query.magicLinkToken)}`,
      });
      expect(verify.statusCode, verify.body).toBe(200);
      const seedCookie = getSessionCookieFromResponse(verify, cookieName);
      const complete = await app.inject({
        method: "PATCH", url: "/v1/me/profile",
        headers: { cookie: `${cookieName}=${seedCookie}` },
        payload: { fullName: `${label} ${marker}`, batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
      });
      expect(complete.statusCode, complete.body).toBe(200);
    }
    const email = `e2e-search-page-${Date.now()}@iitbhu.ac.in`;
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    expect(startRes.statusCode, startRes.body).toBe(200);
    const startBody = startRes.json() as { debug?: { magicLinkUrl?: string } };
    const { challengeId, magicLinkToken } = parseMagicLinkQuery(startBody.debug!.magicLinkUrl!);
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
    const cookie = getSessionCookieFromResponse(verifyRes, cookieName);
    const headers = { cookie: `${cookieName}=${cookie}` };

    const first = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(marker)}&limit=1`,
      headers,
    });
    expect(first.statusCode, first.body).toBe(200);
    const firstBody = first.json() as {
      results?: { id: string }[];
      pageInfo?: { hasMore: boolean; nextCursor: string | null };
    };
    const firstId = firstBody.results?.[0]?.id;
    if (!firstId) throw new Error("Pagination fixture needs a searchable result");
    if (!firstBody.pageInfo?.hasMore || !firstBody.pageInfo.nextCursor) {
      throw new Error("Pagination fixture needs at least two searchable results and a next cursor");
    }

    const second = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(marker)}&limit=1&cursor=${encodeURIComponent(firstBody.pageInfo.nextCursor)}`,
      headers,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { results?: { id: string }[] };
    const secondId = secondBody.results?.[0]?.id;
    expect(secondId).toBeDefined();
    expect(secondId).not.toBe(firstId);
  });

  it("authenticated: search ranks exact name (tier 0) before title FTS match (tier 1)", async () => {
    const now = Date.now();
    const emailA = `e2e-rank-a-${now}@iitbhu.ac.in`;
    const emailB = `e2e-rank-b-${now}@iitbhu.ac.in`;
    const emailC = `e2e-rank-c-${now}@iitbhu.ac.in`;
    const marker = `e2erank${now}`;
    const exactQ = `Zeta Rank ${marker}`;

    const login = async (e: string): Promise<{ cookie: string; personId: string } | null> => {
      const startRes = await app.inject({
        method: "POST",
        url: "/v1/auth/start",
        payload: { institutionalEmail: e },
      });
      expect(startRes.statusCode, startRes.body).toBe(200);
      const sb = startRes.json() as { debug?: { magicLinkUrl?: string } };
      const { challengeId, magicLinkToken } = parseMagicLinkQuery(sb.debug!.magicLinkUrl!);
      const verifyRes = await app.inject({
        method: "GET",
        url: `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`,
      });
      expect(verifyRes.statusCode, verifyRes.body).toBe(200);
      const ck = getSessionCookieFromResponse(verifyRes, cookieName);
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `${cookieName}=${ck}` },
      });
      const meBody = meRes.json() as { person?: { personId: string } };
      const personId = meBody.person?.personId;
      if (!personId) throw new Error("Login did not return personId");
      return { cookie: ck, personId };
    };

    const userA = await login(emailA);
    const userB = await login(emailB);
    const userC = await login(emailC);
    if (!userA?.personId || !userB?.personId || !userC?.personId) throw new Error("Could not log in as all three test users");

    const headersA = { cookie: `${cookieName}=${userA.cookie}` };
    const headersB = { cookie: `${cookieName}=${userB.cookie}` };
    const headersC = { cookie: `${cookieName}=${userC.cookie}` };

    const patchA = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: headersA,
      payload: { fullName: exactQ, batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
    });
    const patchB = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: headersB,
      payload: { fullName: `Alpha Other ${marker}`, batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
    });
    expect(patchA.statusCode, patchA.body).toBe(200);
    expect(patchB.statusCode, patchB.body).toBe(200);

    const occRes = await app.inject({
      method: "POST",
      url: "/v1/me/occupations",
      headers: headersB,
      payload: {
        occupationTypeCode: "full_time_employment",
        roleTitle: exactQ,
        startDate: "2020-01-01",
        isCurrent: true,
      },
    });
    expect(occRes.statusCode, occRes.body).toBe(201);

    const patchC = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: headersC,
      payload: { fullName: `Observer Only ${marker}`, batchYear: 2020, departmentCode: "cse", markMinimumProfileComplete: true },
    });
    expect(patchC.statusCode, patchC.body).toBe(200);

    const searchRes = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(exactQ)}&dept=cse&batch=2020&limit=50`,
      headers: headersC,
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json() as { results?: { id: string; fullName: string }[] };
    const ids = (searchBody.results ?? []).map((r) => r.id);
    const ia = ids.indexOf(userA.personId);
    const ib = ids.indexOf(userB.personId);
    expect(ib).toBeGreaterThanOrEqual(0);
    expect(ia).toBeGreaterThanOrEqual(0);
    expect(ia).toBeLessThan(ib);
  });
});
