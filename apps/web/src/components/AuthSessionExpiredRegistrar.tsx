import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { setAuthSessionExpiredListener } from "../lib/authSessionExpiredBridge";

/**
 * When a protected API call returns `AUTH_UNAUTHORIZED` (expired/invalid session cookie),
 * log out and send the user to the login page.
 *
 * Only fires while the app considers the visitor signed in. Anonymous visitors routinely
 * get 401s from session bootstrap calls (login page, sign-in link verification), and
 * bouncing them mid-flow cancels an in-progress sign-in.
 */
export function AuthSessionExpiredRegistrar() {
  const navigate = useNavigate();
  const { logout, status } = useAuth();
  const busyRef = useRef(false);
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setAuthSessionExpiredListener(() => {
      if (statusRef.current !== "authenticated") return;
      if (busyRef.current) return;
      busyRef.current = true;
      void logout()
        .catch(() => {
          /* cookie may already be invalid; logout still clears client session */
        })
        .finally(() => {
          busyRef.current = false;
          navigate("/login?reason=session_expired", { replace: true });
        });
    });
    return () => setAuthSessionExpiredListener(null);
  }, [logout, navigate]);

  return null;
}
