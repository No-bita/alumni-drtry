import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { LankaGate } from "../components/LankaGate";
import { api } from "../api/client";
import { canAccessOnboardingFlow, superAdminSkipsAlumniJourney } from "../lib/onboardingEligibility";
import { useAuth, type AuthSessionSnapshot } from "../contexts/AuthContext";

type LoginPhase = "form" | "sending" | "sent";
type SentAuthMethod = "otp" | "password";

const OTP_LENGTH = 6;
const emptyOtpDigits = (): string[] => Array.from({ length: OTP_LENGTH }, () => "");
const DEV_PASSWORD_LOGIN_EMAIL = "seed-admin-placeholder@example.invalid";

/** Basename (no extension) of files in `public/media/` — must match disk names (spaces OK; URLs are encoded). */
const SUCCESS_VIDEO_STEM = "Gen 4 Turbo Varanasi Aerial";

function successVideoSrc(ext: "webm" | "mp4"): string {
  return `/media/${encodeURIComponent(SUCCESS_VIDEO_STEM)}.${ext}`;
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refetch } = useAuth();

  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<LoginPhase>("form");
  const [error, setError] = useState<string | null>(null);

  const [challengeId, setChallengeId] = useState<string | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setPhase("sending");
    try {
      const { data, error: err, retryAfterSeconds } = await api.post<{
        challengeId: string;
        sentTo?: string;
      }>("/v1/auth/start", {
        institutionalEmail: normalizedEmail,
      });
      if (err) {
        let msg = err.message ?? err.code;
        if (err.code === "AUTH_RATE_LIMITED" && retryAfterSeconds != null) {
          const mins = Math.ceil(retryAfterSeconds / 60);
          msg += ` Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`;
        }
        setError(msg);
        setPhase("form");
        return;
      }
      const cid = data?.challengeId ?? null;
      setChallengeId(cid);
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
      if (superAdminSkipsAlumniJourney(person)) {
        navigate("/home", { replace: true });
        return;
      }
      if (!p) {
        navigate("/home", { replace: true });
        return;
      }
      if (p.onboardingCompletedAt) {
        navigate("/home", { replace: true });
        return;
      }
      navigate(canAccessOnboardingFlow(p, person) ? "/onboarding" : "/home", { replace: true });
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
        "Sign in with a Google account that uses your IIT BHU email (@iitbhu.ac.in or @itbhu.ac.in).",
      google_unverified: "Verify your email in Google, then try again.",
      google_failed: "Google sign-in failed. Try again from the home page or use email below.",
    };
    setError(map[err] ?? `Something went wrong (${err}).`);
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
    return (
      <>
        <Nav hideSignInLink hideSignOut />
        <div className="login-gate-sent">
          {showSuccessVideo && prefersReduceMotion ? (
            <span className="visually-hidden" role="status" aria-live="polite">
              Signed in. Continuing…
            </span>
          ) : (
            <>
              <LankaGate phase="waiting" />
              <p
                className="eyebrow"
                style={{
                  marginBottom: 8,
                  textTransform: "none",
                  letterSpacing: "0.04em",
                  lineHeight: 1.35,
                }}
              >
                Lanka Bechyu! Lanka Bechyu! Lanka Bechyu
              </p>
              <h2 className="section-headline" style={{ marginBottom: 12 }}>
                We&apos;ve sent you a code
              </h2>
              {passwordEnabledForEmail ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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
                  <Button
                    type="submit"
                    variant="primary"
                    style={{ marginTop: 16, width: "100%" }}
                    disabled={passwordSubmitting}
                  >
                    {passwordSubmitting ? "Checking…" : "Sign in"}
                  </Button>
                </form>
              ) : (
                <form className="login-gate-sent__otp" onSubmit={handleOtpSubmit}>
                  <label htmlFor="login-otp-0">One-time code</label>
                  <div
                    className="login-gate-sent__otp-cells"
                    onPaste={handleOtpPaste}
                    role="group"
                    aria-label="One-time code"
                  >
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
                  {otpError && (
                    <p style={{ color: "var(--brick)", fontSize: 13, marginTop: 10 }}>{otpError}</p>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    style={{ marginTop: 16, width: "100%" }}
                    disabled={!challengeId || otpSubmitting}
                  >
                    {otpSubmitting ? "Checking…" : "enter"}
                  </Button>
                </form>
              )}
              <p className="small-note" style={{ marginTop: 20 }}>
                You can still open the magic link in your inbox — either path signs you in.
              </p>
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
                }}
                style={{ marginTop: 24 }}
              >
                Use a different email
              </Button>
            </>
          )}
        </div>
      </>
    );
  }

  if (phase === "sending") {
    return (
      <>
        <Nav hideSignInLink hideSignOut />
        <div
          style={{
            maxWidth: 420,
            margin: "4rem auto",
            padding: "0 var(--page-x)",
          }}
        >
          <div className="login-sending" role="status" aria-live="polite" aria-busy="true">
            <div className="login-sending__spinner" aria-hidden />
            <p className="login-sending__line">Hang tight — we’re sending your sign-in link.</p>
          </div>
        </div>
      </>
    );
  }

  if (googleResume) {
    return (
      <>
        <Nav hideSignInLink hideSignOut />
        <div
          style={{
            maxWidth: 420,
            margin: "4rem auto",
            padding: "0 var(--page-x)",
          }}
        >
          <div className="login-sending" role="status" aria-live="polite" aria-busy="true">
            <div className="login-sending__spinner" aria-hidden />
            <p className="login-sending__line">Signing you in…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav hideSignInLink hideSignOut />
      <div
        style={{
          maxWidth: 420,
          margin: "4rem auto",
          padding: "0 var(--page-x)",
        }}
      >
        <h2 className="section-headline" style={{ marginBottom: 16 }}>
          Use your insti email ID to log in
        </h2>
        <form onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="you@iitbhu.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ marginBottom: 16 }}
          />
          {error && (
            <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" style={{ width: "100%" }}>
            Send magic link
          </Button>
        </form>
      </div>
    </>
  );
}
