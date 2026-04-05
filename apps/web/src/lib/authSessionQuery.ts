import { api, type Me, type MePerson, type MeProfileResponse, type MyProfileView } from "../api/client";

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

export async function fetchAuthSession(signal: AbortSignal): Promise<AuthSessionData> {
  const [meRes, profileRes] = await Promise.all([
    api.get<Me>("/v1/me", { signal }),
    api.get<MeProfileResponse>("/v1/me/profile", { signal }),
  ]);

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
