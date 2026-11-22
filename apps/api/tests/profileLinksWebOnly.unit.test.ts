import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PROFILE_LINK_URL_MAX, isWebUrl } from "../src/lib/webUrl.js";
import { isWebUrl as isNoteWebUrl } from "../src/lib/noteDetails.js";
import { LinkService } from "../src/services/linkService.js";

/** BUG-013: profile links are web links only, on create and update, and in the database (072). */

const NOT_WEB = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "mailto:someone@example.com",
  "file:///etc/passwd",
  "ftp://example.com/file",
  "https://localhost",
  "https://exa mple.com",
  "example.com",
  ""
];

describe("isWebUrl", () => {
  it("accepts ordinary http and https links", () => {
    expect(isWebUrl("https://www.linkedin.com/in/sample", PROFILE_LINK_URL_MAX)).toBe(true);
    expect(isWebUrl("http://example.com/a?b=c#d", PROFILE_LINK_URL_MAX)).toBe(true);
    expect(isWebUrl("HTTPS://EXAMPLE.COM", PROFILE_LINK_URL_MAX)).toBe(true);
  });
  it.each(NOT_WEB)("refuses %j", (value) => {
    expect(isWebUrl(value, PROFILE_LINK_URL_MAX)).toBe(false);
  });
  it("respects the length limit, and notes keep their own shorter one", () => {
    const long = `https://example.com/${"a".repeat(600)}`;
    expect(isWebUrl(long, PROFILE_LINK_URL_MAX)).toBe(true);
    expect(isNoteWebUrl(long)).toBe(false);
    expect(isNoteWebUrl("javascript:alert(1)")).toBe(false);
  });
});

function makeService(current: Record<string, unknown> | null = null) {
  const svc = new LinkService({} as Pool);
  const repo = {
    create: vi.fn(async (input: Record<string, unknown>) => ({ id: "l1", ...input })),
    update: vi.fn(async (input: Record<string, unknown>) => ({ id: "l1", ...input })),
    findByIdAndPerson: vi.fn(async () => current)
  };
  (svc as unknown as { linkRepo: typeof repo }).linkRepo = repo;
  return { svc, repo };
}

describe("LinkService", () => {
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"])("refuses to create %j and saves nothing", async (url) => {
    const { svc, repo } = makeService();
    await expect(svc.createMyLink("p1", { platform: "Website", url })).rejects.toMatchObject({ statusCode: 400, code: "LINK_NOT_WEB" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("creates an https link (trimmed)", async () => {
    const { svc, repo } = makeService();
    await svc.createMyLink("p1", { platform: "Website", url: "  https://example.com/me " });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/me" }));
  });

  it("refuses an update to a non-web link, and an update without a URL keeps the saved one", async () => {
    const saved = { id: "l1", platform: "Website", url: "https://example.com", label: null };
    const { svc, repo } = makeService(saved);
    await expect(svc.updateMyLink("p1", "l1", { url: "javascript:alert(1)" })).rejects.toMatchObject({ code: "LINK_NOT_WEB" });
    expect(repo.update).not.toHaveBeenCalled();
    await svc.updateMyLink("p1", "l1", { label: "Site" });
    expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com", label: "Site" }));
  });
});

describe("migration 072", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/072_profile_links_web_only.sql"), "utf8");
  it("refuses new non-web links and leaves existing rows untouched", () => {
    const rule = "url ~* '^https?://[^[:space:]]+$'";
    expect(sql).not.toContain("DELETE");
    expect(sql).toContain(`ADD CONSTRAINT profile_links_url_web CHECK (${rule}) NOT VALID;`);
    const pattern = /^https?:\/\/[^\s]+$/i;
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "https://a b.com"]) expect(pattern.test(bad)).toBe(false);
    expect(pattern.test("https://example.com")).toBe(true);
  });
});
