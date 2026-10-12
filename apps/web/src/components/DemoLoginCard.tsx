import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NETWORK_ERROR_MESSAGE, api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import {
  demoLandingPath,
  demoStartStep,
  getTourStorage,
  writeDemoTourState,
} from "../lib/demoMode";
import { Button } from "./Button";
import { Input } from "./Input";
import "../styles/demo.css";

type DemoLoginResponse = { demo?: boolean; tour?: { start?: string } | null };

/** Login-page entry for prospects: a separate path from the OTP flow, never mixed with it. */
export function DemoLoginCard() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Add the demo email and password you were given.");
      return;
    }
    setError(null);
    setBusy(true);
    const { data, error: err, retryAfterSeconds } = await api.post<DemoLoginResponse>(
      "/v1/auth/demo-login",
      { email: email.trim(), password }
    );
    if (err || !data?.demo) {
      setBusy(false);
      if (retryAfterSeconds) {
        setError(`Lots of visitors right now. Try again in about ${retryAfterSeconds} seconds.`);
      } else if (err?.code === "NETWORK_ERROR") {
        setError(err.message ?? NETWORK_ERROR_MESSAGE);
      } else {
        setError("That email and password don't match. Double-check what you were sent.");
      }
      return;
    }
    writeDemoTourState(getTourStorage(), { status: "active", step: demoStartStep(data.tour?.start) });
    const snapshot = await auth.refetch();
    setBusy(false);
    if (!snapshot) {
      setError("You are in, but we could not load your session. Please try again.");
      return;
    }
    navigate(demoLandingPath(data.tour), { replace: true });
  };

  if (!open) {
    return (
      <div className="demo-login">
        <button type="button" className="demo-login__toggle" onClick={() => setOpen(true)}>
          Just looking around? Take the demo tour
        </button>
      </div>
    );
  }

  return (
    <form className="demo-login demo-login--open" onSubmit={submit} aria-label="Demo sign in">
      <p className="demo-login__title">Take the demo tour</p>
      <p className="demo-login__hint">
        A look-around account with made-up alumni. Nothing you do here touches real members.
      </p>
      <Input
        type="email"
        label="Demo email"
        placeholder="Demo email"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        autoComplete="off"
        style={{ marginBottom: 10 }}
      />
      <Input
        type="password"
        label="Demo password"
        placeholder="Demo password"
        value={password}
        onChange={(ev) => setPassword(ev.target.value)}
        autoComplete="off"
        style={{ marginBottom: 10 }}
      />
      {error ? (
        <p className="demo-login__error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" style={{ width: "100%" }} disabled={busy}>
        {busy ? "Opening the gates…" : "Start the tour"}
      </Button>
      <button type="button" className="demo-login__toggle" onClick={() => setOpen(false)}>
        Never mind
      </button>
    </form>
  );
}
