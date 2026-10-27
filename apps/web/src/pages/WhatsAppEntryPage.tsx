import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Nav } from "../components/Nav";
import { WhatsAppNotesSettings } from "../components/WhatsAppNotesSettings";
import { useAuth } from "../contexts/AuthContext";
import { canAccessOnboardingFlow } from "../lib/onboardingEligibility";
import {
  WHATSAPP_LINK_REFUSALS,
  WHATSAPP_SETTINGS_KEY,
  checkWhatsAppLink,
  claimWhatsAppLink,
  clearWhatsAppEntry,
  pendingWhatsAppEntry,
  rememberWhatsAppEntry,
  safeNext,
} from "../lib/whatsapp";
import "../styles/whatsapp.css";

type View =
  | { kind: "working" }
  | { kind: "confirm"; numberHint: string; token: string; next: string | null }
  | { kind: "linked" }
  | { kind: "declined" }
  | { kind: "error"; message: string };

/**
 * /w/<code> (short links) and /wa?t=… (full links) — where every link from the WhatsApp bot lands.
 * After sign-in (if needed) it asks "Link WhatsApp ending 3210 to your account?", links the number
 * once, then continues: onboarding for new members, the link's destination (e.g. "Send note") otherwise.
 * A number that's already this member's skips the question.
 */
export function WhatsAppEntryPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { code } = useParams<{ code?: string }>();
  const [view, setView] = useState<View>({ kind: "working" });
  const started = useRef(false);

  // A short link's code goes through the same steps as a full signed link; the server knows which is which.
  const t = code ?? params.get("t");
  const next = params.get("next");
  const profile = auth.status === "authenticated" ? auth.myProfile : null;

  /** Linked (or already was): onboarding first if unfinished, then where the link pointed. */
  const continueOn = useCallback(
    (to: string | null) => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_SETTINGS_KEY });
      if (profile && !profile.onboardingCompletedAt && canAccessOnboardingFlow(profile)) {
        navigate("/onboarding", { replace: true });
        return;
      }
      if (to) {
        navigate(to, { replace: true });
        return;
      }
      setView({ kind: "linked" });
    },
    [navigate, profile, queryClient]
  );

  useEffect(() => {
    // Remember the link first, so it survives the trip through sign-in.
    if (t && !started.current) rememberWhatsAppEntry(t, next);
    if (auth.status === "loading" || started.current) return;
    if (auth.status === "unauthenticated") {
      started.current = true;
      navigate("/login?src=whatsapp", { replace: true });
      return;
    }
    started.current = true;
    void (async () => {
      const pending = pendingWhatsAppEntry();
      if (!pending) {
        setView({ kind: "error", message: "This WhatsApp link has expired. Text hi to the bot for a new one." });
        return;
      }
      const result = await checkWhatsAppLink(pending.t);
      if ("error" in result) {
        clearWhatsAppEntry();
        setView({ kind: "error", message: result.error });
        return;
      }
      const { status, numberHint } = result.check;
      // Full links carry their destination; short links get it from the server.
      const to = pending.next ?? safeNext(result.check.next);
      if (status === "already_yours") {
        clearWhatsAppEntry();
        continueOn(to);
        return;
      }
      if (status === "ready") {
        setView({ kind: "confirm", numberHint, token: pending.t, next: to });
        return;
      }
      clearWhatsAppEntry();
      setView({ kind: "error", message: WHATSAPP_LINK_REFUSALS[status] });
    })();
  }, [auth.status, continueOn, navigate, t, next]);

  const onConfirm = async (token: string, to: string | null) => {
    setView({ kind: "working" });
    const problem = await claimWhatsAppLink(token);
    clearWhatsAppEntry();
    if (problem) {
      setView({ kind: "error", message: problem });
      return;
    }
    continueOn(to);
  };

  const onNotMe = () => {
    clearWhatsAppEntry();
    setView({ kind: "declined" });
  };

  const home = (
    <div className="wa-entry__actions">
      <Button variant="primary" onClick={() => navigate("/home")}>
        Go to Alma Mater
      </Button>
    </div>
  );

  return (
    <div className="wa-entry-shell">
      <Nav hideSignInLink />
      <main className="wa-entry">
        {view.kind === "error" ? (
          <>
            <h1 className="wa-entry__title">Link didn&apos;t work</h1>
            <p className="wa-entry__text" role="alert">
              {view.message}
            </p>
            {home}
          </>
        ) : view.kind === "confirm" ? (
          <>
            <h1 className="wa-entry__title">Link WhatsApp ending {view.numberHint} to your account?</h1>
            <p className="wa-entry__text">
              Only say yes if this is your own number. Once linked, it stays with your account.
            </p>
            <div className="wa-entry__actions">
              <Button variant="primary" onClick={() => void onConfirm(view.token, view.next)}>
                Yes, link it
              </Button>
              <Button variant="secondary" onClick={onNotMe}>
                Not me
              </Button>
            </div>
          </>
        ) : view.kind === "declined" ? (
          <>
            <h1 className="wa-entry__title">Nothing was linked</h1>
            <p className="wa-entry__text">To use the bot, text hi to it from your own WhatsApp.</p>
            {home}
          </>
        ) : view.kind === "linked" ? (
          <>
            <h1 className="wa-entry__title">WhatsApp linked</h1>
            <p className="wa-entry__text">You can ask for referrals by texting hi to the bot.</p>
            <WhatsAppNotesSettings />
            {home}
          </>
        ) : (
          <p className="wa-entry__text" role="status">
            Checking your WhatsApp link…
          </p>
        )}
      </main>
    </div>
  );
}
