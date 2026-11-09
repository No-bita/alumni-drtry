import { isInstitutionalEmail } from "../lib/institutionalEmail";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { LankaGate } from "../components/LankaGate";
import { LandingWorldMap } from "../components/LandingWorldMap";
import { usePhoneViewport } from "../hooks/usePhoneViewport";
import { API_BASE_URL, api } from "../api/client";
import { startAuthWithWakeRetry } from "../lib/authStartRetry";
import {
  deliveryOf,
  resendAfterMs,
  resendNotice,
  sentBody,
  sentHeadline,
  type AuthStartDelivery,
  type AuthStartResponse,
} from "../lib/authStartDelivery";
import { ResendCodeButton } from "../components/ResendCodeButton";
import { claimRememberedInvite, rememberInviteFromUrl } from "../lib/inviteAttribution";
import { pendingWhatsAppEntry, whatsappEntryForSignIn } from "../lib/whatsapp";
import { warmUpApi } from "../lib/apiWarmup";
import { canAccessOnboardingFlow } from "../lib/onboardingEligibility";
import { useAuth, type AuthSessionSnapshot } from "../contexts/AuthContext";
import { publicAsset } from "../lib/appBase";
import { takeReturnTo } from "../lib/returnTo";

type LoginPhase = "form" | "sending" | "timeout" | "sent";
type SentAuthMethod = "otp" | "password";

const OTP_LENGTH = 6;
const emptyOtpDigits = (): string[] => Array.from({ length: OTP_LENGTH }, () => "");
const DEV_PASSWORD_LOGIN_EMAIL = "seed-admin-placeholder@example.invalid";
const AUTH_HERO_STATS = [
  { value: "400+", keyword: "alumni", label: "active this week" },
  { value: "38", keyword: "referrals", label: "completed last week" },
  { value: "27", keyword: "cities", label: "connected" },
] as const;

/** Basename (no extension) of files in `public/media/` — must match disk names (spaces OK; URLs are encoded). */
const SUCCESS_VIDEO_STEM = "Gen 4 Turbo Varanasi Aerial";

function successVideoSrc(ext: "webm" | "mp4"): string {
  return publicAsset(`media/${encodeURIComponent(SUCCESS_VIDEO_STEM)}.${ext}`);
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refetch } = useAuth();
  const isPhone = usePhoneViewport();
  // Match the desktop right-rail breakpoint; tablets retain their map-free layout.
  const [showDesktopMap, setShowDesktopMap] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setShowDesktopMap(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const [email, setEmail] = useState("");
  const emailDomainInvalid = email.trim().length > 0 && !isInstitutionalEmail(email);
  const [phase, setPhase] = useState<LoginPhase>("form");
  const [error, setError] = useState<string | null>(null);
  /** True once the first sign-in request got no answer and we are retrying quietly. */
  const [serverWaking, setServerWaking] = useState(false);
  /** Guards, not copy, decide when Continue may be tapped: during the server's rate-limit countdown another tap cannot help. */
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  /** Synchronous double-submit guard: state updates batch, so rapid taps could both pass the phase check. */
  const submitInFlightRef = useRef(false);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  /** What the server says happened to the email; the code screen says exactly that. */
  const [delivery, setDelivery] = useState<AuthStartDelivery>("sent");
  /** The address the code went to, as the server normalised it. */
  const [sentTo, setSentTo] = useState("");
  /** Epoch ms when the server will email a new code (its duplicate window). */
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  /** Result of the last Resend tap ("New code sent. Earlier codes no longer work."). */
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [showSuccessVideo, setShowSuccessVideo] = useState(false);
  const [prefersReduceMotion, setPrefersReduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const loginCompleteRef = useRef(false);
  /** While success video plays: session refetch + Home chunk load in parallel so /home is ready when the clip ends. */
  const sessionPrefetchRef = useRef<Promise<AuthSessionSnapshot | null> | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(() => emptyOtpDigits());
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [sentAuthMethod, setSentAuthMethod] = useState<SentAuthMethod>("otp");
  const [passwordEnabledForEmail, setPasswordEnabledForEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  useEffect(() => {
    // Invite links (`/login?ref=&ch=`): remember them until sign-in finishes.
    rememberInviteFromUrl(window.location.search);
    // Invisible: start waking the API host while the user types their email.
    warmUpApi();
    return () => {
      startAbortRef.current?.abort();
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  // Google and email sign-in appear together, or email appears alone: both wait on
  // one availability check. enabled:true shows both options. A successful
  // enabled:false answer means Google is not configured, so only email shows.
  // A failed or slow (over 10 seconds) check keeps email and adds a
  // "temporarily unavailable" note with a retry, because Google availability is
  // then unconfirmed, not necessarily off. Whichever answer comes first settles
  // the card, so a response landing after the timeout never swaps the options
  // under the user.
  type GoogleConfigState =
    | { status: "checking" }
    | { status: "rechecking" }
    | { status: "ready"; enabled: boolean }
    | { status: "error" };
  const [googleConfig, setGoogleConfig] = useState<GoogleConfigState>({ status: "checking" });
  const googleConfigAttemptRef = useRef(0);
  const googleConfigTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runGoogleConfigCheck = useCallback((isRetry: boolean) => {
    const attempt = ++googleConfigAttemptRef.current;
    setGoogleConfig({ status: isRetry ? "rechecking" : "checking" });
    let settled = false;
    const finish = (next: GoogleConfigState) => {
      if (settled || googleConfigAttemptRef.current !== attempt) return;
      settled = true;
      if (googleConfigTimerRef.current) clearTimeout(googleConfigTimerRef.current);
      setGoogleConfig(next);
    };
    if (googleConfigTimerRef.current) clearTimeout(googleConfigTimerRef.current);
    googleConfigTimerRef.current = setTimeout(() => finish({ status: "error" }), 10_000);
    void api
      .get<{ enabled: boolean }>("/v1/auth/google/config")
      .then((res) => {
        // The api client resolves { error } for HTTP and network failures; only a
        // clean 200 with enabled:false means "not configured", everything else is
        // an unconfirmed check and gets the retry state.
        if (res.error || res.aborted) {
          finish({ status: "error" });
          return;
        }
        finish({ status: "ready", enabled: Boolean(res.data?.enabled) });
      })
      .catch(() => finish({ status: "error" }));
  }, []);
  useEffect(() => {
    runGoogleConfigCheck(false);
    return () => {
      googleConfigAttemptRef.current += 1; // invalidate any in-flight attempt after unmount
      if (googleConfigTimerRef.current) clearTimeout(googleConfigTimerRef.current);
    };
  }, [runGoogleConfigCheck]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === "sending" || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      await submitLogin();
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const submitLogin = async () => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    if (!isInstitutionalEmail(normalizedEmail)) {
      setError("Use your institute email.");
      return;
    }

    // Acknowledge the click immediately: the sign-in request can wait on a
    // sleeping or unreachable API, and a button that shows nothing reads as
    // dead.
    setPhase("sending");

    try {
      setServerWaking(false);
      const outcome = await requestCode(normalizedEmail, () => setServerWaking(true));
      if (outcome.kind === "aborted") return;
      setServerWaking(false);
      if (outcome.kind === "timeout") {
        setPhase("timeout");
        return;
      }
      const { data, error: err, retryAfterSeconds } = outcome.result;
      if (err) {
        let msg = err.message ?? err.code;
        if (err.code === "AUTH_RATE_LIMITED" && retryAfterSeconds != null) {
          const mins = Math.ceil(retryAfterSeconds / 60);
          msg += ` Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`;
          setRateLimitedUntil(Date.now() + retryAfterSeconds * 1000);
          if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
          rateLimitTimerRef.current = setTimeout(() => setRateLimitedUntil(null), retryAfterSeconds * 1000);
        }
        setError(msg);
        setPhase("form");
        return;
      }
      const cid = data?.challengeId ?? null;
      setChallengeId(cid);
      if (data) applyDelivery(data, normalizedEmail);
      setResendMessage(null);
      loginCompleteRef.current = false;
      setShowSuccessVideo(false);
      setOtpDigits(emptyOtpDigits());
      setOtpError(null);
      const enablePassword = normalizedEmail === DEV_PASSWORD_LOGIN_EMAIL;
      setPasswordEnabledForEmail(enablePassword);
      setSentAuthMethod("otp");
      setPassword("");
      setPasswordError(null);
      setPhase("sent");
      if (!cid) {
        setOtpError("Could not start sign-in. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("form");
    }
  };

  /** One sign-in start at a time; quiet retries only where they cannot send a second email. */
  const requestCode = (normalizedEmail: string, onWaking?: () => void) => {
    startAbortRef.current?.abort();
    const controller = new AbortController();
    startAbortRef.current = controller;
    return startAuthWithWakeRetry(
      (signal) => {
        // From a WhatsApp bot link: the email's sign-in link carries it, so clicking it anywhere continues the WhatsApp step.
        const whatsappEntry = whatsappEntryForSignIn();
        return api.post<AuthStartResponse>(
          "/v1/auth/start",
          { institutionalEmail: normalizedEmail, ...(whatsappEntry ? { whatsappEntry } : {}) },
          { signal }
        );
      },
      { signal: controller.signal, onWaking }
    );
  };

  const applyDelivery = (data: AuthStartResponse, normalizedEmail: string) => {
    setDelivery(deliveryOf(data));
    setSentTo(data.sentTo ?? normalizedEmail);
    setResendAvailableAt(Date.now() + resendAfterMs(data));
  };

  /** Resend from the code screen. Only reachable once the server would actually email again. */
  const handleResend = async () => {
    if (resendBusy || submitInFlightRef.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    submitInFlightRef.current = true;
    setResendBusy(true);
    setResendMessage(null);
    try {
      const outcome = await requestCode(normalizedEmail);
      if (outcome.kind === "aborted") return;
      if (outcome.kind === "timeout") {
        setResendMessage("Still no answer from the server. Check your inbox before trying again.");
        return;
      }
      const { data, error: err, retryAfterSeconds } = outcome.result;
      if (err || !data?.challengeId) {
        if (err?.code === "AUTH_RATE_LIMITED" && retryAfterSeconds != null) {
          const mins = Math.ceil(retryAfterSeconds / 60);
          setResendAvailableAt(Date.now() + retryAfterSeconds * 1000);
          setResendMessage(`Too many codes requested. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`);
        } else {
          setResendMessage(err?.message ?? "Could not send a new code. Try again.");
        }
        return;
      }
      const next = deliveryOf(data);
      setChallengeId(data.challengeId);
      applyDelivery(data, normalizedEmail);
      setResendMessage(resendNotice(next));
      if (next !== "already_sent") {
        setOtpDigits(emptyOtpDigits());
        setOtpError(null);
      }
    } catch {
      setResendMessage("Could not send a new code. Try again.");
    } finally {
      submitInFlightRef.current = false;
      setResendBusy(false);
    }
  };

  const completeLogin = useCallback(
    async (prefetched: Promise<AuthSessionSnapshot | null> | null | undefined) => {
      if (loginCompleteRef.current) return;
      loginCompleteRef.current = true;
      const snap = await (prefetched ?? refetch());
      sessionPrefetchRef.current = null;
      if (!snap) {
        loginCompleteRef.current = false;
        navigate("/login", { replace: true });
        return;
      }
      const { person, profile: p } = snap;
      // Credit an invite link, if one brought them here (server ignores it for existing members).
      void claimRememberedInvite();
      // Came from the WhatsApp bot: finish linking the number there (it then routes to onboarding or the link).
      if (!person.isDemo && pendingWhatsAppEntry()) {
        navigate("/wa", { replace: true });
        return;
      }
      if (person.isDemo) {
        navigate("/search", { replace: true });
        return;
      }
      if (!p) {
        navigate("/home", { replace: true });
        return;
      }
      if (p.onboardingCompletedAt) {
        navigate(takeReturnTo() ?? "/home", { replace: true });
        return;
      }
      navigate(canAccessOnboardingFlow(p) ? "/onboarding" : "/home", { replace: true });
    },
    [navigate, refetch]
  );

  useEffect(() => {
    const err = searchParams.get("error");
    if (!err) return;
    const map: Record<string, string> = {
      cancelled: "Google sign-in was cancelled.",
      google_invalid: "Could not complete Google sign-in. Try again.",
      google_state: "Sign-in session expired. Try again.",
      google_domain:
        "Sign in with a Google account that uses your institute email.",
      google_unverified: "Verify your email in Google, then try again.",
      google_failed: "Google sign-in failed. Try again from the home page or use email below.",
    };
    setError(map[err] ?? `Something went wrong (${err}).`);
    navigate("/login", { replace: true });
  }, [searchParams, navigate]);

  useEffect(() => {
    if (searchParams.get("reason") !== "session_expired") return;
    setError("Your session expired. Please sign in again.");
    navigate("/login", { replace: true });
  }, [searchParams, navigate]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!showSuccessVideo || !prefersReduceMotion) return;
    void completeLogin(undefined);
  }, [showSuccessVideo, prefersReduceMotion, completeLogin]);

  useEffect(() => {
    if (!showSuccessVideo || prefersReduceMotion) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showSuccessVideo, prefersReduceMotion]);

  const googleResume = searchParams.get("google") === "1";
  useEffect(() => {
    if (!googleResume) return;
    void completeLogin(undefined);
  }, [googleResume, completeLogin]);

  const renderAuthMarketingShell = (cardMount: ReactNode) => (
    <section className="auth-merged">
      <div className="auth-merged__hero">
        {(showDesktopMap || isPhone) && <LandingWorldMap className="auth-merged__map" showTestimonials={!isPhone} />}
        <div className="auth-merged__hero-copy">
          <h1 className="auth-merged__title">
            Where alumni
            <br />
            <span className="auth-merged__title-nowrap">
              <span className="auth-merged__title-accent">open doors for each other.</span>
            </span>
          </h1>
          {!isPhone && <ul className="auth-merged__hero-stats" aria-label="Network highlights">
            {AUTH_HERO_STATS.map(({ value, keyword, label }) => (
              <li key={label} className="auth-merged__stat">
                <span className="auth-merged__stat-headline">
                  <span className="auth-merged__stat-number">{value}</span>{" "}
                  <span className="auth-merged__stat-keyword">{keyword}</span>
                </span>
                <span className="auth-merged__stat-label">{label}</span>
              </li>
            ))}
          </ul>}
        </div>
        <div className="auth-merged__card-mount">{cardMount}</div>
      </div>
    </section>
  );

  const handleOtpDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned === "") {
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    if (cleaned.length === 1) {
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index] = cleaned;
        return next;
      });
      if (index < OTP_LENGTH - 1) {
        otpInputRefs.current[index + 1]?.focus();
      }
      return;
    }
    const chars = cleaned.slice(0, OTP_LENGTH - index).split("");
    setOtpDigits((prev) => {
      const next = [...prev];
      chars.forEach((ch, j) => {
        if (index + j < OTP_LENGTH) next[index + j] = ch;
      });
      return next;
    });
    const nextFocus = Math.min(index + chars.length, OTP_LENGTH - 1);
    requestAnimationFrame(() => otpInputRefs.current[nextFocus]?.focus());
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace") return;
    if (otpDigits[index] !== "") return;
    e.preventDefault();
    if (index === 0) return;
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index - 1] = "";
      return next;
    });
    otpInputRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!text) return;
    const next = emptyOtpDigits();
    text.split("").forEach((ch, i) => {
      if (i < OTP_LENGTH) next[i] = ch;
    });
    setOtpDigits(next);
    const focusIdx = Math.min(text.length, OTP_LENGTH - 1);
    requestAnimationFrame(() => otpInputRefs.current[focusIdx]?.focus());
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    const code = otpDigits.join("");
    if (!challengeId || code.length !== OTP_LENGTH) {
      setOtpError("Enter the 6-digit code from your email.");
      return;
    }
    setOtpSubmitting(true);
    const { error: verr } = await api.post("/v1/auth/verify", {
      challengeId,
      otp: code,
    });
    setOtpSubmitting(false);
    if (verr) {
      setOtpError(verr.message ?? verr.code ?? "Invalid code.");
      return;
    }
    if (!prefersReduceMotion) {
      sessionPrefetchRef.current = refetch();
      void import("../pages/Home");
    }
    setShowSuccessVideo(true);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!passwordEnabledForEmail || normalizedEmail !== DEV_PASSWORD_LOGIN_EMAIL) {
      setPasswordError("Password login is unavailable for this email.");
      return;
    }
    if (!password.trim()) {
      setPasswordError("Enter your password.");
      return;
    }
    setPasswordError(null);
    setPasswordSubmitting(true);
    const { error: perr } = await api.post("/v1/auth/password-login", {
      institutionalEmail: normalizedEmail,
      password,
    });
    setPasswordSubmitting(false);
    if (perr) {
      setPasswordError(perr.message ?? perr.code ?? "Password login failed.");
      return;
    }
    if (!prefersReduceMotion) {
      sessionPrefetchRef.current = refetch();
      void import("../pages/Home");
    }
    setShowSuccessVideo(true);
  };

  if (phase === "sent" && showSuccessVideo && !prefersReduceMotion) {
    return (
      <div className="login-success-video login-success-video--fullscreen">
        <span className="visually-hidden" role="status" aria-live="polite">
          Signed in. Continuing…
        </span>
        <video
          className="login-success-video__media"
          autoPlay
          muted
          playsInline
          onEnded={() => void completeLogin(sessionPrefetchRef.current)}
          onError={() => void completeLogin(sessionPrefetchRef.current)}
        >
          <source src={successVideoSrc("webm")} type="video/webm" />
          <source src={successVideoSrc("mp4")} type="video/mp4" />
        </video>
      </div>
    );
  }

  if (phase === "sent") {
    const sentCard = (
      <div className="auth-merged__card auth-merged__card--sent">
        {showSuccessVideo && prefersReduceMotion ? (
          <span className="visually-hidden" role="status" aria-live="polite">
            Signed in. Continuing…
          </span>
        ) : (
          <>
            <LankaGate phase="waiting" />
            <p className="auth-merged__code-kicker">Lanka Bechyu! Lanka Bechyu! Lanka Bechyu</p>
            <h2 className="section-headline auth-merged__card-title">{sentHeadline(delivery)}</h2>
            <p className="auth-merged__card-subtitle">{sentBody(delivery, sentTo || email.trim().toLowerCase())}</p>
            {passwordEnabledForEmail ? (
              <div className="auth-merged__toggle-row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setSentAuthMethod("otp")}
                  aria-pressed={sentAuthMethod === "otp"}
                  style={{ opacity: sentAuthMethod === "otp" ? 1 : 0.75 }}
                >
                  OTP
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setSentAuthMethod("password")}
                  aria-pressed={sentAuthMethod === "password"}
                  style={{ opacity: sentAuthMethod === "password" ? 1 : 0.75 }}
                >
                  Password
                </button>
              </div>
            ) : null}
            {sentAuthMethod === "password" && passwordEnabledForEmail ? (
              <form className="login-gate-sent__otp" onSubmit={handlePasswordSubmit}>
                <label htmlFor="login-password-field">Password</label>
                <Input
                  id="login-password-field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                {passwordError ? (
                  <p style={{ color: "var(--brick)", fontSize: 13, marginTop: 10 }}>{passwordError}</p>
                ) : null}
                <Button type="submit" variant="primary" style={{ marginTop: 16, width: "100%" }} disabled={passwordSubmitting}>
                  {passwordSubmitting ? "Checking…" : "Sign in"}
                </Button>
              </form>
            ) : (
              <form className="login-gate-sent__otp" onSubmit={handleOtpSubmit}>
                <label htmlFor="login-otp-0">One-time code</label>
                <div className="login-gate-sent__otp-cells" onPaste={handleOtpPaste} role="group" aria-label="One-time code">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpInputRefs.current[i] = el;
                      }}
                      id={i === 0 ? "login-otp-0" : undefined}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      className="input login-gate-sent__otp-cell"
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      disabled={otpSubmitting}
                      aria-invalid={!!otpError}
                    />
                  ))}
                </div>
                {otpError && <p style={{ color: "var(--brick)", fontSize: 13, marginTop: 10 }}>{otpError}</p>}
                <Button type="submit" variant="primary" style={{ marginTop: 16, width: "100%" }} disabled={!challengeId || otpSubmitting}>
                  {otpSubmitting ? "Checking…" : "Enter code"}
                </Button>
                {resendMessage && (
                  <p role="status" aria-live="polite" className="login-gate-sent__resend-note">
                    {resendMessage}
                  </p>
                )}
                <ResendCodeButton key={resendAvailableAt} availableAt={resendAvailableAt} busy={resendBusy} onResend={() => void handleResend()} />
              </form>
            )}
            <Button
              variant="back"
              onClick={() => {
                setPhase("form");
                setError(null);
                setChallengeId(null);
                loginCompleteRef.current = false;
                sessionPrefetchRef.current = null;
                setShowSuccessVideo(false);
                setOtpDigits(emptyOtpDigits());
                setOtpError(null);
                setPassword("");
                setPasswordError(null);
                setPasswordEnabledForEmail(false);
                setSentAuthMethod("otp");
                setResendMessage(null);
              }}
              style={{ marginTop: 24 }}
            >
              Use a different email
            </Button>
          </>
        )}
      </div>
    );
    return (
      <div className="auth-login-page">
        <Nav hideSignInLink hideSignOut />
        {renderAuthMarketingShell(sentCard)}
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div className="auth-login-page">
        <Nav hideSignInLink hideSignOut />
        {renderAuthMarketingShell(
          <div className="auth-merged__card">
            <div role="alert">
              <p className="auth-merged__error">
                Still no answer from the server, so we can&apos;t confirm your code went out. Check your inbox first. If a code arrived, tap Try again and enter it: we won&apos;t send a duplicate.
              </p>
              <Button
                type="button"
                variant="primary"
                style={{ marginTop: 16, width: "100%" }}
                onClick={(e) => void handleSubmit(e as unknown as React.FormEvent)}
              >
                Try again
              </Button>
              <Button
                type="button"
                variant="secondary"
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => setPhase("form")}
              >
                Use a different email
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "sending") {
    return (
      <div className="auth-login-page">
        <Nav hideSignInLink hideSignOut />
        {renderAuthMarketingShell(
          <div className="auth-merged__card">
            <div className="login-sending" role="status" aria-live="polite" aria-busy="true">
              <div className="login-sending__spinner" aria-hidden />
              <p className="login-sending__line">
                {serverWaking
                    ? "Waking up the server. It naps when nobody is around, so this can take up to 30 seconds."
                    : "Sending your sign-in link…"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (googleResume) {
    return (
      <div className="auth-login-page">
        <Nav hideSignInLink hideSignOut />
        {renderAuthMarketingShell(
          <div className="auth-merged__card">
            <div className="login-sending" role="status" aria-live="polite" aria-busy="true">
              <div className="login-sending__spinner" aria-hidden />
              <p className="login-sending__line">Signing you in…</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const googleButtonContents = (
    <>
      <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continue with Google
    </>
  );

  return (
    <div className="auth-login-page">
      <Nav hideSignInLink hideSignOut />
      {renderAuthMarketingShell(
        <div className="auth-merged__card">
          {googleConfig.status === "checking" ? (
            <div className="login-sending" role="status" aria-live="polite" aria-busy="true">
              <div className="login-sending__spinner" aria-hidden />
              <p className="login-sending__line">Loading sign-in options…</p>
            </div>
          ) : (
            <>
          <div className="auth-merged__card-heading">
            <span className="auth-merged__card-icon" aria-hidden>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2.25" y="5" width="19.5" height="14" rx="2.25" />
                <path d="M3 7.5 12 13l9-5.5" />
              </svg>
            </span>
            <h2 className="section-headline auth-merged__card-title">
              Continue with your insti email
            </h2>
          </div>
          {googleConfig.status === "rechecking" ? (
            <div className="auth-merged__google">
              <div className="login-sending" role="status" aria-live="polite" aria-busy="true">
                <div className="login-sending__spinner" aria-hidden />
                <p className="login-sending__line">Loading sign-in options…</p>
              </div>
            </div>
          ) : googleConfig.status === "error" ? (
            <div className="auth-merged__google">
              <a
                className="btn btn--secondary auth-merged__google-btn"
                href={`${API_BASE_URL}/v1/auth/google`}
                aria-disabled="true"
                onClick={(e) => e.preventDefault()}
              >
                {googleButtonContents}
              </a>
              <p className="auth-merged__google-note" role="status">Google sign-in is temporarily unavailable.</p>
              <button type="button" className="btn btn--secondary auth-merged__google-btn" onClick={() => runGoogleConfigCheck(true)}>
                Retry
              </button>
              <p className="auth-merged__google-or">or use your email</p>
            </div>
          ) : googleConfig.status === "ready" && googleConfig.enabled ? (
            <div className="auth-merged__google">
              <a className="btn btn--secondary auth-merged__google-btn" href={`${API_BASE_URL}/v1/auth/google`}>
                {googleButtonContents}
              </a>
              <p className="auth-merged__google-or">or use your email</p>
            </div>
          ) : null}
          <form onSubmit={handleSubmit}>
            <Input
              type="email"
              placeholder="you@itbhu.ac.in"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              required
              aria-invalid={emailDomainInvalid}
              aria-describedby={emailDomainInvalid ? "institution-email-error" : undefined}
              autoComplete="email"
              style={{ marginBottom: 16 }}
            />
            {emailDomainInvalid ? <p id="institution-email-error" className="auth-merged__error" role="status">Use your institute email.</p> : null}
            {error && !(emailDomainInvalid && error === "Use your institute email.") && <p className="auth-merged__error">{error}</p>}
            <Button type="submit" variant="primary" style={{ width: "100%" }} disabled={rateLimitedUntil !== null || emailDomainInvalid}>
              Continue
            </Button>
          </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
