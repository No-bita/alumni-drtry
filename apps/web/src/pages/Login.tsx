import { useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { api } from "../api/client";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error: err, retryAfterSeconds } = await api.post("/v1/auth/start", {
        institutionalEmail: email.trim(),
      });
      if (err) {
        let msg = err.message ?? err.code;
        if (err.code === "AUTH_RATE_LIMITED" && retryAfterSeconds != null) {
          const mins = Math.ceil(retryAfterSeconds / 60);
          msg += ` Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`;
        }
        setError(msg);
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <>
        <Nav hideSignInLink />
        <div
          style={{
            maxWidth: 420,
            margin: "4rem auto",
            padding: "0 var(--page-x)",
            textAlign: "center",
          }}
        >
          <p className="eyebrow" style={{ marginBottom: 8 }}>Check your inbox</p>
          <h2 className="section-headline" style={{ marginBottom: 16 }}>
            We sent a link to <strong>{email}</strong>
          </h2>
          <p className="body-text" style={{ color: "var(--ink-muted)" }}>
            Open the link in that email to continue. It may take a minute to arrive.
          </p>
          <Button
            variant="back"
            onClick={() => { setSent(false); setError(null); }}
            style={{ marginTop: 24 }}
          >
            Use a different email
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav hideSignInLink />
      <div
        style={{
          maxWidth: 420,
          margin: "4rem auto",
          padding: "0 var(--page-x)",
        }}
      >
        <h2 className="section-headline" style={{ marginBottom: 16 }}>
          Use your <span className="italic-accent">@iitbhu.ac.in</span> or @itbhu.ac.in email
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
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Sending…" : "Send magic link"}
          </Button>
        </form>
        <p className="small-note" style={{ marginTop: 16 }}>
          We’ll email you a magic link. No password needed.
        </p>
      </div>
    </>
  );
}
