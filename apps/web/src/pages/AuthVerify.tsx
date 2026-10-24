import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { useAuth } from "../contexts/AuthContext";
import { FoldToFlight } from "../components/FoldToFlight";
import { api } from "../api/client";
import { canAccessOnboardingFlow } from "../lib/onboardingEligibility";
import { queryKeys } from "../lib/queryKeys";

export function AuthVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const refetchRef = useRef(refetch);
  useLayoutEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const { challengeId, magicLinkToken } = useMemo(() => {
    return {
      challengeId: searchParams.get("challengeId"),
      magicLinkToken: searchParams.get("magicLinkToken"),
    };
  }, [searchParams]);

  const canVerify = Boolean(challengeId && magicLinkToken);
  const [sessionRefetchFailed, setSessionRefetchFailed] = useState(false);

  const verifyQuery = useQuery({
    queryKey: queryKeys.auth.magicLinkVerify(challengeId ?? "", magicLinkToken ?? ""),
    queryFn: async ({ signal }) => {
      const verifyUrl = `/v1/auth/verify?challengeId=${encodeURIComponent(challengeId!)}&magicLinkToken=${encodeURIComponent(magicLinkToken!)}`;
      const res = await api.get(verifyUrl, { signal });
      if (res.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (res.error) {
        throw new Error(res.error.message ?? res.error.code ?? "Verify failed.");
      }
      return true;
    },
    enabled: canVerify,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!verifyQuery.isSuccess) return;
    void (async () => {
      const snap = await refetchRef.current();
      if (!snap) {
        setSessionRefetchFailed(true);
        return;
      }
      const { profile: p } = snap;
      if (!p) {
        navigate("/home", { replace: true });
        return;
      }
      if (p.onboardingCompletedAt) {
        navigate("/home", { replace: true });
        return;
      }
      navigate(canAccessOnboardingFlow(p) ? "/onboarding" : "/home", { replace: true });
    })();
  }, [verifyQuery.isSuccess, navigate]);

  return (
    <>
      <Nav />
      <div className="page-shell--centered">
        {canVerify && !verifyQuery.isError && !sessionRefetchFailed && (verifyQuery.isPending || verifyQuery.isSuccess) ? (
          <FoldToFlight ready={false} />
        ) : null}
        {(!canVerify || verifyQuery.isError || sessionRefetchFailed) && (
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
