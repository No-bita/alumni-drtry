import { describe, expect, it } from "vitest";
import { startAuthBodySchema } from "../src/routes/authRoutes.js";

const EMAIL = "member@iitbhu.ac.in";

describe("startAuthBodySchema: a malformed optional WhatsApp entry never blocks sign-in", () => {
  it("keeps a valid entry", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: EMAIL, whatsappEntry: { token: "k3x9Qa7Z", next: "/match?q=x" } });
    expect(r.success).toBe(true);
    expect(r.data?.whatsappEntry).toEqual({ token: "k3x9Qa7Z", next: "/match?q=x" });
  });

  it("accepts the sign-in with no entry", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: EMAIL });
    expect(r.success).toBe(true);
    expect(r.data?.whatsappEntry).toBeUndefined();
  });

  it("drops an over-long token but still accepts the sign-in", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: EMAIL, whatsappEntry: { token: "x".repeat(5000), next: "/match" } });
    expect(r.success).toBe(true);
    expect(r.data?.whatsappEntry).toBeUndefined();
  });

  it("drops an under-length token", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: EMAIL, whatsappEntry: { token: "short" } });
    expect(r.success).toBe(true);
    expect(r.data?.whatsappEntry).toBeUndefined();
  });

  it("drops an entry whose next is too long", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: EMAIL, whatsappEntry: { token: "k3x9Qa7Z", next: "/" + "a".repeat(2000) } });
    expect(r.success).toBe(true);
    expect(r.data?.whatsappEntry).toBeUndefined();
  });

  it("drops an entry of the wrong shape entirely", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: EMAIL, whatsappEntry: "not-an-object" });
    expect(r.success).toBe(true);
    expect(r.data?.whatsappEntry).toBeUndefined();
  });

  it("still rejects an invalid institutional email", () => {
    const r = startAuthBodySchema.safeParse({ institutionalEmail: "not-an-email", whatsappEntry: { token: "k3x9Qa7Z" } });
    expect(r.success).toBe(false);
  });
});
