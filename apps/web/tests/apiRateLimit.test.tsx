import { useSyncExternalStore } from "react";
import { subscribeApiRateLimit } from "../src/lib/apiRateLimit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getApiRateLimit, parseRetryAfter } from "../src/lib/apiRateLimit";
import { api } from "../src/api/client";
import { warmUpApi, resetApiWarmupForTests } from "../src/lib/apiWarmup";
import { AuthRateLimitPause, fetchAuthSession } from "../src/lib/authSessionQuery";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { AUTH_SESSION_QUERY_KEY } from "../src/lib/authSessionQuery";
import { startAuthWithWakeRetry } from "../src/lib/authStartRetry";
function PauseProbe() { const state = useSyncExternalStore(subscribeApiRateLimit, getApiRateLimit); return <span>{state.paused ? "paused" : "active"}</span>; }
const limited = (headers = {}) => new Response('<html><title>Just a moment...</title></html>', { status: 429, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge', ...headers } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); resetApiWarmupForTests(); });
describe('temporary infrastructure request brake', () => {
 it('recognizes non-JSON challenge429 and stops all subsequent automatic paths', async () => {
  const fetch = vi.fn().mockResolvedValue(limited()); vi.stubGlobal('fetch', fetch);
  expect((await api.get('/v1/me')).status).toBe(429);
  await api.get('/v1/me/profile'); await api.get('/v1/auth/google/config'); warmUpApi();
  expect(fetch).toHaveBeenCalledTimes(1); expect(getApiRateLimit().paused).toBe(true);
 });
 it('health warm-up429 also trips the same brake', async () => {
  const fetch = vi.fn().mockResolvedValue(limited()); vi.stubGlobal('fetch', fetch); warmUpApi();
  await waitFor(() => expect(getApiRateLimit().paused).toBe(true));
  await api.get('/v1/me'); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('cancels another pending GET when first429 arrives', async () => {
  const fetch = vi.fn((url: string, init: RequestInit) => url.includes('slow') ? new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted','AbortError')))) : Promise.resolve(limited()));
  vi.stubGlobal('fetch', fetch); const slow = api.get('/slow'); await api.get('/v1/me');
  expect(await slow).toEqual({ aborted: true });
 });
 it('does not abort an already-sent write or replay it', async () => {
  let complete!: (r: Response) => void;
  const fetch = vi.fn((url: string) => url.includes('/write') ? new Promise<Response>(r => { complete = r; }) : Promise.resolve(limited()));
  vi.stubGlobal('fetch', fetch); const write = api.post('/write', {}); await api.get('/v1/me');
  complete(new Response('{}')); expect((await write).data).toEqual({}); expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('one manual retry is allowed, but success does not restart background traffic', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValue(new Response('{"enabled":true}')); vi.stubGlobal('fetch', fetch);
  await api.get('/v1/me'); expect((await api.get('/v1/auth/google/config', { manualRetry: true })).data).toEqual({ enabled:true });
  await api.get('/v1/me/profile'); expect(fetch).toHaveBeenCalledTimes(2); expect(getApiRateLimit().paused).toBe(true);
 });
 it('rapid manual retries cannot overlap and another429 stays paused', async () => {
  let complete!: (r: Response) => void; const fetch = vi.fn().mockResolvedValueOnce(limited()).mockImplementation(() => new Promise<Response>(r => { complete = r; })); vi.stubGlobal('fetch', fetch);
  await api.get('/v1/me'); const first = api.get('/v1/auth/google/config', { manualRetry: true }); await api.get('/v1/auth/google/config', { manualRetry: true });
  expect(fetch).toHaveBeenCalledTimes(2); complete(limited()); await first; expect(getApiRateLimit().paused).toBe(true);
 });
 it('parses numeric/date Retry-After and refuses manual network calls before expiry', async () => {
  expect(parseRetryAfter('30', 1000)).toBe(31000); expect(parseRetryAfter('nonsense', 1000)).toBe(null);
  expect(parseRetryAfter('Wed, 01 Jan 2031 00:00:00 GMT', 1000)).toBe(Date.parse('2031-01-01T00:00:00Z'));
  const fetch = vi.fn().mockResolvedValue(limited({'retry-after':'60'})); vi.stubGlobal('fetch', fetch);
  await api.get('/v1/me'); await api.get('/v1/auth/google/config', { manualRetry:true }); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('retains pause across remounts and cooldown expiry without polling', async () => {
  vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValue(limited({'retry-after':'2'})); vi.stubGlobal('fetch', fetch);
  await api.get('/v1/me'); const v=render(<PauseProbe/>); expect(screen.getByText("paused")).toBeTruthy();
  await vi.advanceTimersByTimeAsync(3000); v.unmount(); render(<PauseProbe/>); await api.get('/v1/me/profile');
  expect(fetch).toHaveBeenCalledTimes(1); expect(getApiRateLimit().paused).toBe(true);
 });
 it('session bootstrap throws pause rather than marking session unauthenticated', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => limited()));
  await expect(fetchAuthSession(new AbortController().signal)).rejects.toBeInstanceOf(AuthRateLimitPause);
 });
 it('preserves a cached signed-in session when refetch hits429', async () => {
  const qc = new QueryClient();
  qc.setQueryData(AUTH_SESSION_QUERY_KEY, {kind:'authenticated',person:{personId:'member1',role:'alumni'},myProfile:null,myProfileError:false});
  function Probe() { const auth=useAuth(); return <><span>{auth.status}</span><button onClick={()=>void auth.refetch()}>Refresh session</button></>; }
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(limited()));
  render(<QueryClientProvider client={qc}><AuthProvider><Probe/></AuthProvider></QueryClientProvider>);
  expect(screen.getByText('authenticated')).toBeTruthy();
  fireEvent.click(screen.getByText('Refresh session'));
  await waitFor(()=>expect(getApiRateLimit().paused).toBe(true));
  expect(screen.getByText('authenticated')).toBeTruthy();
 });
 it('stops an email wake retry after another request hits429', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(limited()));
  const send=vi.fn().mockResolvedValue({error:{code:'NETWORK_ERROR'}});
  const sleep=vi.fn(async()=>{await api.get('/v1/healthz');});
  const out=await startAuthWithWakeRetry(send,{sleep,deadlineMs:1000,backoffMs:[1]});
  // The pending backoff may finish, but the shared client must not send another request.
  expect(out.kind).toBe('done'); expect(send).toHaveBeenCalledTimes(1);
 });
 it('paused state makes no health requests or extra controls', async () => {
  const fetch=vi.fn().mockResolvedValue(limited());vi.stubGlobal('fetch',fetch);
  await api.get('/v1/me');render(<PauseProbe/>);
  expect(screen.getByText("paused")).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
 });
});
