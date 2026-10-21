import { api, type Me, type MePerson, type MeProfileResponse, type MyProfileView } from "../api/client";
import { FIXTURE_DEMO_PERSON, FIXTURE_DEMO_PROFILE, isFixtureDemoSessionActive } from "./fixtureDemo";

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
     check at call time AND at resolution so a stale response can never win the race. */
  if (isFixtureDemoSessionActive()) return fixtureDemoSession();
  const [meRes, profileRes] = await Promise.all([
    api.get<Me>("/v1/me", { signal }),
    api.get<MeProfileResponse>("/v1/me/profile", { signal }),
  ]);

  if (meRes.error || !meRes.data?.person) {
    return { kind: "unauthenticated" };
  }

  if (isFixtureDemoSessionActive()) return fixtureDemoSession();

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
