/** These tests mutate city-wide rows. Only loopback databases explicitly named *_test are allowed. */
export function assertDisposableCitiesDatabase(connectionString: string | undefined): void {
  let safe = false;
  try {
    const u = new URL(connectionString ?? "");
    const name = decodeURIComponent(u.pathname.slice(1));
    safe = ["postgres:", "postgresql:"].includes(u.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      && /^[a-z0-9_]+_test$/i.test(name)
      && [...u.searchParams.keys()].every(key => !["host", "hostaddr", "dbname", "database", "service"].includes(key.toLowerCase()));
  } catch { /* Fail closed without printing credentials. */ }
  if (!safe) throw new Error("Cities integration tests require a disposable loopback database named *_test. No database work was started.");
}
