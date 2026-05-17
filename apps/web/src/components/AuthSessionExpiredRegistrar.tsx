import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { setAuthSessionExpiredListener } from "../lib/authSessionExpiredBridge";

/**
 * When a protected API call returns `AUTH_UNAUTHORIZED` (expired/invalid session cookie),
 * log out and send the user to the login page.
 */
export function AuthSessionExpiredRegistrar() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const busyRef = useRef(false);

  useEffect(() => {
    setAuthSessionExpiredListener(() => {
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
