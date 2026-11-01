import { describe, expect, it } from "vitest";
import { assertDisposableCitiesDatabase } from "./helpers/disposableDatabase.js";
describe("Cities disposable database gate", () => {
  it.each(["postgres://localhost/alumni_test", "postgresql://user:pass@127.0.0.1:5432/cities_test", "postgres://[::1]/alumni_test"])("allows explicit local test database %s", url => expect(() => assertDisposableCitiesDatabase(url)).not.toThrow());
  it.each([undefined, "", "not-a-url", "postgres://localhost/production", "postgres://prod.example/alumni_test", "postgres://localhost.evil.test/alumni_test", "postgres://test:localhost@prod.example/live", "https://localhost/alumni_test", "postgres://localhost/alumni_test?host=prod.example"])("rejects unsafe target without leaking credentials", url => {
    expect(() => assertDisposableCitiesDatabase(url)).toThrow("disposable loopback database");
  });
});
