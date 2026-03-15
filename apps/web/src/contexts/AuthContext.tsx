import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Me, type MePerson } from "../api/client";

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; person: MePerson }
  | { status: "unauthenticated" };

type AuthContextValue = AuthState & { refetch: () => Promise<void>; logout: () => Promise<void> };

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  refetch: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refetch = useCallback(async () => {
    setState({ status: "loading" });
    const { data, error } = await api.get<Me>("/v1/me");
    if (error || !data?.person) {
      setState({ status: "unauthenticated" });
      return;
    }
    setState({ status: "authenticated", person: data.person });
  }, []);

  const logout = useCallback(async () => {
    await api.post("/v1/auth/logout");
    setState({ status: "unauthenticated" });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ ...state, refetch, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
