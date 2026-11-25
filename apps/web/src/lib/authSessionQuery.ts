import { getApiRateLimit } from "./apiRateLimit";
export class AuthRateLimitPause extends Error {}
import {
  api,
  setViewAsReadOnly,
  type Me,
  type MePerson,
  type MeProfileResponse,
  type MyProfileView,
  type ViewAsInfo,
} from "../api/client";

/** Single cache key for `/v1/me` + `/v1/me/profile` (see `AuthProvider`). */
export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;

export type AuthSessionData =
  | { kind: "unauthenticated" }
  | {
      kind: "authenticated";
      person: MePerson;
      myProfile: MyProfileView | null;
      myProfileError: boolean;
      /** Admin "view as member" in progress (read-only); `person` is the member. */
      viewAs: ViewAsInfo | null;
      /** The signed-in admin may use "view as member". */
      canViewAs: boolean;
    };

export async function fetchAuthSession(signal: AbortSignal): Promise<AuthSessionData> {
  const [meRes, profileRes] = await Promise.all([
    api.get<Me>("/v1/me", { signal }),
    api.get<MeProfileResponse>("/v1/me/profile", { signal }),
  ]);

  if (meRes.status === 429 || profileRes.status === 429 || getApiRateLimit().paused) {
    throw new AuthRateLimitPause("Requests paused");
  }

  if (meRes.error || !meRes.data?.person) {
    setViewAsReadOnly(false);
    return { kind: "unauthenticated" };
  }

  const person = meRes.data.person;
  const viewAs = meRes.data.viewAs ?? null;
  setViewAsReadOnly(Boolean(viewAs));
  const profile = profileRes.data?.profile;
  const profileFailed = Boolean(profileRes.error || !profile);

  return {
    kind: "authenticated",
    person,
    myProfile: profileFailed ? null : profile!,
    myProfileError: profileFailed,
    viewAs,
    canViewAs: Boolean(meRes.data.canViewAs),
  };
}
