import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { api, type MePerson, type MyProfileView } from "../api/client";
import {
  AUTH_SESSION_QUERY_KEY,
  fetchAuthSession,
  type AuthSessionData,
} from "../lib/authSessionQuery";
import { queryClient } from "../queryClient";
import { isFixtureDemoPageEnabled } from "../lib/fixtureDemo";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      person: MePerson;
      myProfile: MyProfileView | null;
      myProfileError: boolean;
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
  };
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  refetch: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  /* The /demo entry seeds its own fixture session in a layout effect: the sample
     experience must not perform the real login check at all. Skip only the boot
     fetch on that route - a manual refetch (a real login submit) still works. The
     pathname comes from the router so the gate re-evaluates after the entry
     navigates on: the query re-enables and is fixture-intercepted during the demo,
     and the real session check resumes once the visitor leaves it. */
  const { pathname } = useLocation();
  const skipBootLoginCheck =
    isFixtureDemoPageEnabled && pathname.replace(/\/+$/, "") === "/demo";
  const query = useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: ({ signal }) => fetchAuthSession(signal),
    enabled: !skipBootLoginCheck,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const refetch = useCallback(async (): Promise<AuthSessionSnapshot | null> => {
    const result = await query.refetch();
    const d = result.data;
    return d ? sessionToSnapshot(d) : null;
  }, [query]);

  const logout = useCallback(async () => {
    await api.post("/v1/auth/logout");
    queryClient.clear();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, { kind: "unauthenticated" });
    /* Leaving the fixture demo routes through this same logout: invalidate so the real
       session check refires immediately instead of trusting the freshly seeded
       unauthenticated entry for the whole staleTime window (a signed-in member who
       peeked at the demo gets their real session back). */
    void queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
  }, []);

  const value = useMemo((): AuthContextValue => {
    let base: AuthState;
    if (query.isPending) {
      base = { status: "loading" };
    } else if (query.isError) {
      base = { status: "unauthenticated" };
    } else {
      base = dataToAuthState(query.data);
    }
    return { ...base, refetch, logout };
  }, [query.isPending, query.isError, query.data, refetch, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Context consumer — not a component. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
