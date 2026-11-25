import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  isViewAsReadOnly,
  setViewAsReadOnly,
  VIEW_AS_END_API_PATH,
  type MePerson,
  type MyProfileView,
  type ViewAsInfo,
} from "../api/client";
import {
  AUTH_SESSION_QUERY_KEY,
  fetchAuthSession,
  AuthRateLimitPause,
  type AuthSessionData,
} from "../lib/authSessionQuery";
import { queryClient } from "../queryClient";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      person: MePerson;
      myProfile: MyProfileView | null;
      myProfileError: boolean;
      /** Admin "view as member" in progress (read-only): `person` and `myProfile` are that member's. */
      viewAs?: ViewAsInfo | null;
      /** The signed-in admin may use "view as member" (admin and on the server allowlist). */
      canViewAs?: boolean;
    };

/** Resolved session after GET /v1/me + /v1/me/profile (same shape `refetch` returns for navigation). */
export type AuthSessionSnapshot = {
  person: MePerson;
  profile: MyProfileView | null;
  myProfileError: boolean;
};

type AuthContextValue = AuthState & {
  refetch: () => Promise<AuthSessionSnapshot | null>;
  logout: () => Promise<void>;
  /** Sign out of all devices (every session for this member). Throws when the server refused. */
  logoutAll: () => Promise<void>;
};

function sessionToSnapshot(d: AuthSessionData): AuthSessionSnapshot | null {
  if (d.kind !== "authenticated") {
    return null;
  }
  return {
    person: d.person,
    profile: d.myProfile,
    myProfileError: d.myProfileError,
  };
}

function dataToAuthState(data: AuthSessionData | undefined): AuthState {
  if (!data) {
    return { status: "loading" };
  }
  if (data.kind === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  return {
    status: "authenticated",
    person: data.person,
    myProfile: data.myProfile,
    myProfileError: data.myProfileError,
    viewAs: data.viewAs ?? null,
    canViewAs: Boolean(data.canViewAs),
  };
}

/** Signing out while viewing as a member: end view-as first (the API refuses every other write meanwhile). */
async function endViewAsBeforeSignOut(): Promise<void> {
  if (!isViewAsReadOnly()) return;
  await api.post(VIEW_AS_END_API_PATH);
  setViewAsReadOnly(false);
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  refetch: async () => null,
  logout: async () => {},
  logoutAll: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: ({ signal }) => fetchAuthSession(signal),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: (count, error) => !(error instanceof AuthRateLimitPause) && count < 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const refetch = useCallback(async (): Promise<AuthSessionSnapshot | null> => {
    const result = await query.refetch();
    const d = result.data;
    return d ? sessionToSnapshot(d) : null;
  }, [query]);

  const logout = useCallback(async () => {
    await endViewAsBeforeSignOut();
    const { error } = await api.post("/v1/auth/logout");
    if (error) throw new Error(error.message ?? "Couldn't sign out. Try again.");
    queryClient.clear();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, { kind: "unauthenticated" });
  }, []);

  const logoutAll = useCallback(async () => {
    await endViewAsBeforeSignOut();
    const { error } = await api.post("/v1/auth/logout-all");
    if (error) throw new Error(error.message ?? "Couldn't sign out of all devices. Try again.");
    queryClient.clear();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, { kind: "unauthenticated" });
  }, []);

  const value = useMemo((): AuthContextValue => {
    let base: AuthState;
    if (query.isPending) {
      base = { status: "loading" };
    } else if (query.data) {
      base = dataToAuthState(query.data);
    } else if (query.error instanceof AuthRateLimitPause) {
      base = { status: "loading" };
    } else if (query.isError) {
      base = { status: "unauthenticated" };
    } else {
      base = { status: "loading" };
    }
    return { ...base, refetch, logout, logoutAll };
  }, [query.isPending, query.isError, query.error, query.data, refetch, logout, logoutAll]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Context consumer — not a component. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
