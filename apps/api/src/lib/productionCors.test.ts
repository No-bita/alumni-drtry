import { describe, expect, it } from "vitest";
import { validateProductionCorsOrigin } from "./productionCors.js";

describe("validateProductionCorsOrigin", () => {
  it("no-ops when not production", () => {
    expect(() => validateProductionCorsOrigin("development", "*")).not.toThrow();
    expect(() => validateProductionCorsOrigin("test", "")).not.toThrow();
  });

  it("allows explicit origins in production", () => {
    expect(() =>
      validateProductionCorsOrigin("production", "https://app.example.com")
    ).not.toThrow();
    expect(() =>
      validateProductionCorsOrigin("production", "https://a.com, https://b.com")
    ).not.toThrow();
  });

  it("rejects wildcard or empty in production", () => {
    expect(() => validateProductionCorsOrigin("production", "*")).toThrow(/CORS_ORIGIN/);
    expect(() => validateProductionCorsOrigin("production", "   ")).toThrow(/CORS_ORIGIN/);
    expect(() => validateProductionCorsOrigin("production", "https://a.com,*")).toThrow(/CORS_ORIGIN/);
  });
});
