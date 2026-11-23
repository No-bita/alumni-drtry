import { readFileSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryRepo, mapSearchRow } from "../src/repos/discoveryRepo.js";
import { contactRequestRoutes } from "../src/routes/contactRequestRoutes.js";
import { betaPersonPredicate } from "../src/lib/analyticsBetaPersonSql.js";
import { personIsSeededDemoSql } from "../src/lib/demoPersonSql.js";

/** Search cards (layout A): the 'search' reachout source, the click-time status lookup, the institute, and the bio removal. */

const migration = (name: string) => readFileSync(path.resolve(import.meta.dirname, `../src/db/migrations/${name}`), "utf8");

describe("migration 074", () => {
  const sql = migration("074_contact_request_search_source.sql");
  it("adds 'search' as a source with the same categories as Ask, Careers and profiles", () => {
    expect(sql).toContain("source IN ('match', 'whatsapp', 'careers', 'cities', 'profile', 'search')");
    expect(sql).toContain("source IN ('match', 'whatsapp', 'careers', 'profile', 'search')");
    expect(sql).toContain("'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'");
    expect(sql).toContain("source = 'cities'");
  });
});

describe("migration 075", () => {
  const sql = migration("075_drop_people_bio.sql");
  it("keeps [DEMO] profiles flagged as test users before the bio is dropped", () => {
    const backfill = sql.indexOf("SET is_test_user = TRUE");
    const drop = sql.indexOf("ALTER TABLE people DROP COLUMN IF EXISTS bio");
    expect(backfill).toBeGreaterThan(-1);
    expect(sql).toContain("WHERE bio ILIKE '%[DEMO]%'");
    expect(drop).toBeGreaterThan(backfill);
  });

  it("replaces the bio search index with one on exactly the text the search builds", () => {
    expect(sql.indexOf("DROP INDEX IF EXISTS idx_people_fts_profile")).toBeLessThan(sql.indexOf("DROP COLUMN IF EXISTS bio"));
    expect(sql).toContain(
      "to_tsvector('simple'::regconfig, COALESCE(full_name, '') || ' ' || COALESCE(residence_country, '') || ' ' || COALESCE(residence_city, ''))"
    );
  });
});

describe("directory search", () => {
  async function searchSql(): Promise<string> {
    const calls: string[] = [];
    const query = vi.fn(async (text: string) => {
      calls.push(text);
      return { rows: [], rowCount: 0 };
    });
    await new DiscoveryRepo({ query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never).searchProfiles({
      q: "pricing",
      limit: 20
    } as never);
    return calls.join("\n");
  }

  it("never reads the bio, and matches the new index's text", async () => {
    const sql = await searchSql();
    expect(sql).not.toMatch(/\bbio\b/);
    expect(sql).toContain("COALESCE(p.full_name, '') || ' ' || COALESCE(p.residence_country, '') || ' ' || COALESCE(p.residence_city, '')");
  });

  it("returns the institute from the email domain, never the address", async () => {
    const sql = await searchSql();
    expect(sql).toContain("split_part(lower(p.institutional_email), '@', 2) AS email_domain");
    const view = mapSearchRow({ id: "p1", full_name: "Asha", email_domain: "iitb.ac.in" } as never);
    expect(view.institutionName).toBe("IIT Bombay");
    expect(JSON.stringify(view)).not.toContain("@");
    expect(mapSearchRow({ id: "p1", full_name: "Asha", email_domain: "example.com" } as never).institutionName).toBeNull();
  });
});

describe("GET /v1/contact-requests/status", () => {
  const viewer = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  async function app(map: Map<string, "pending" | "accepted" | "declined">) {
    const latestStatusFromSender = vi.fn(async () => map);
    const server = Fastify();
    server.decorate("authenticate", async (request: { actor?: unknown }) => {
      request.actor = { personId: viewer };
    });
    server.decorate("requireNonDemoMutation", async () => undefined);
    server.decorate("contactRequestService", { latestStatusFromSender } as never);
    server.setErrorHandler((error: { statusCode?: number; code?: string }, _request, reply) => {
      void reply.code(error.statusCode ?? 500).send({ code: error.code });
    });
    await server.register(contactRequestRoutes);
    return { server, latestStatusFromSender };
  }

  it("returns the viewer's latest reachout to that member", async () => {
    const { server, latestStatusFromSender } = await app(new Map([[other, "pending"]]));
    const res = await server.inject({ method: "GET", url: `/v1/contact-requests/status?recipientPersonId=${other}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ yourNote: "pending" });
    expect(latestStatusFromSender).toHaveBeenCalledWith(viewer, [other]);
    await server.close();
  });

  it("is null with no reachout, and for yourself without a lookup", async () => {
    const none = await app(new Map());
    expect((await none.server.inject({ method: "GET", url: `/v1/contact-requests/status?recipientPersonId=${other}` })).json()).toEqual({ yourNote: null });
    await none.server.close();
    const self = await app(new Map([[viewer, "accepted"]]));
    expect((await self.server.inject({ method: "GET", url: `/v1/contact-requests/status?recipientPersonId=${viewer}` })).json()).toEqual({ yourNote: null });
    expect(self.latestStatusFromSender).not.toHaveBeenCalled();
    await self.server.close();
  });

  it("rejects a missing or malformed member id", async () => {
    const { server, latestStatusFromSender } = await app(new Map());
    for (const url of ["/v1/contact-requests/status", "/v1/contact-requests/status?recipientPersonId=nope"]) {
      const res = await server.inject({ method: "GET", url });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ code: "CONTACT_REQUEST_BAD_REQUEST" });
    }
    expect(latestStatusFromSender).not.toHaveBeenCalled();
    await server.close();
  });
});

describe("demo detection without the bio", () => {
  it("analytics leave out test users and seeded demo emails, not a bio marker", () => {
    const sql = betaPersonPredicate("p");
    expect(sql).not.toMatch(/bio/);
    expect(sql).toContain("is_test_user");
    expect(sql).toContain("batchdemo.%");
  });

  it("seeded demo profiles are recognised by their email prefix", () => {
    const sql = personIsSeededDemoSql("people");
    for (const prefix of ["batchdemo.%", "platformdemo.%", "demo.alumni.%"]) expect(sql).toContain(`LIKE '${prefix}'`);
    expect(sql).not.toMatch(/bio|is_test_user/);
  });
});
