import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthSessionExpiredListener } from "../lib/authSessionExpiredBridge";
import { AUTH_SESSION_QUERY_KEY } from "../lib/authSessionKey";

/**
 * Wires global session-expiry handling: `api/*` calls `notifyAuthSessionExpired` on `AUTH_UNAUTHORIZED`
 * when the auth cache still says signed-in (stale cookie + alive SPA).
 */
export function AuthSessionExpiredRegistrar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setAuthSessionExpiredListener(() => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, { kind: "unauthenticated" });
      navigate("/login?reason=session_expired", { replace: true });
    });
    return () => setAuthSessionExpiredListener(null);
  }, [navigate, queryClient]);

  return null;
}
