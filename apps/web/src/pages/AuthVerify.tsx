import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";

export function AuthVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const verifyStarted = useRef(false);

  useEffect(() => {
    const challengeId = searchParams.get("challengeId");
    const magicLinkToken = searchParams.get("magicLinkToken");

    if (!challengeId || !magicLinkToken) {
      setStatus("error");
      return;
    }

    if (verifyStarted.current) return;
    verifyStarted.current = true;

    let cancelled = false;
    api
      .get(
        `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`
      )
      .then(async ({ error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }
        setStatus("success");
        await refetch();
        if (cancelled) return;
        const { data: profileData } = await api.get<{ profile?: { profileCompletedAt?: string | null } }>("/v1/me/profile");
        if (!cancelled) {
          navigate(profileData?.profile?.profileCompletedAt ? "/search" : "/onboarding", { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, refetch]);

  return (
    <>
      <Nav />
      <div
        style={{
          maxWidth: 420,
          margin: "4rem auto",
          padding: "0 var(--page-x)",
          textAlign: "center",
        }}
      >
        {status === "verifying" && (
          <p className="body-text" style={{ color: "var(--ink-muted)" }}>
            Signing you in…
          </p>
        )}
        {status === "error" && (
          <>
            <p className="section-headline" style={{ marginBottom: 8 }}>
              Link invalid or expired
            </p>
            <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 24 }}>
              Request a new sign-in link from the login page.
            </p>
            <Link to="/login">
              <Button variant="primary">Back to sign in</Button>
            </Link>
          </>
        )}
      </div>
    </>
  );
}
