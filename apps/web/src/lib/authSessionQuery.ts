import { api, type Me, type MePerson, type MeProfileResponse, type MyProfileView } from "../api/client";
import type { QueryClient } from "@tanstack/react-query";
import { FIXTURE_DEMO_PERSON, FIXTURE_DEMO_PROFILE, deactivateFixtureDemoSession, isFixtureDemoActive, isFixtureDemoSessionActive } from "./fixtureDemo";

/** Single cache key for `/v1/me` + `/v1/me/profile` (see `AuthProvider`). */
export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;

export type AuthSessionData =
  | { kind: "unauthenticated" }
  | {
      kind: "authenticated";
      person: MePerson;
      myProfile: MyProfileView | null;
      myProfileError: boolean;
    };

function fixtureDemoSession(): AuthSessionData {
  return {
    kind: "authenticated",
    person: FIXTURE_DEMO_PERSON,
    myProfile: FIXTURE_DEMO_PROFILE,
    myProfileError: false,
  };
}

export async function fetchAuthSession(signal: AbortSignal): Promise<AuthSessionData> {
  /* Fixture demo may activate while a real /v1/me call is in flight (lazy /demo chunk):
     check at call time AND at resolution so a stale response can never win the race.
     The resolution check runs before any error handling: a real request that failed
     (even with a non-auth error like NETWORK_ERROR) must not overwrite the seeded
     fixture session either. */
  if (isFixtureDemoActive()) return fixtureDemoSession();
  const [meRes, profileRes] = await Promise.all([
    api.get<Me>("/v1/me", { signal }),
    api.get<MeProfileResponse>("/v1/me/profile", { signal }),
  ]);

  if (isFixtureDemoActive()) return fixtureDemoSession();

  if (meRes.error || !meRes.data?.person) {
    return { kind: "unauthenticated" };
  }

  const person = meRes.data.person;
  const profile = profileRes.data?.profile;
  const profileFailed = Boolean(profileRes.error || !profile);

  return {
    kind: "authenticated",
    person,
    myProfile: profileFailed ? null : profile!,
    myProfileError: profileFailed,
  };
}
/**
 * Reaching the real login page ends a fixture demo: remove the tab marker AND the seeded
 * fixture identity from the auth cache, so RequireAuth cannot admit protected routes on
 * a stale fixture session. Deliberately keyed on the marker (not the build gate) so it
 * also cleans up after the flag is turned off. No-op when no fixture session is active.
 */
export function endFixtureDemoAuthSession(queryClient: QueryClient): void {
  if (!isFixtureDemoSessionActive()) return;
  deactivateFixtureDemoSession();
  queryClient.setQueryData<AuthSessionData>(AUTH_SESSION_QUERY_KEY, { kind: "unauthenticated" });
}
