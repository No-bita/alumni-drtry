import { useState } from "react";
import { Button } from "../Button";

type BuildSupportActionsProps = {
  disabled: boolean;
  onSignal: (kind: "mentorship" | "clients" | "funding") => Promise<void>;
  onConnect: () => Promise<void>;
};

export function BuildSupportActions({ disabled, onSignal, onConnect }: BuildSupportActionsProps) {
  const [busyKey, setBusyKey] = useState<"mentorship" | "clients" | "funding" | "connect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runSignal = async (kind: "mentorship" | "clients" | "funding") => {
    setBusyKey(kind);
    setError(null);
    setSuccess(null);
    try {
      await onSignal(kind);
      setSuccess(
        kind === "mentorship"
          ? "Mentorship interest sent."
          : kind === "clients"
            ? "Client support interest sent."
            : "Funding interest sent."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send support signal.");
    } finally {
      setBusyKey(null);
    }
  };

  const runConnect = async () => {
    setBusyKey("connect");
    setError(null);
    setSuccess(null);
    try {
      await onConnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open connection thread.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="build-support-actions">
      <div className="build-support-actions__row">
        <Button
          variant="secondary"
          type="button"
          onClick={() => void runSignal("mentorship")}
          disabled={disabled || busyKey !== null}
        >
          {busyKey === "mentorship" ? "Sending…" : "Offer mentorship"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => void runSignal("clients")}
          disabled={disabled || busyKey !== null}
        >
          {busyKey === "clients" ? "Sending…" : "Potential client"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => void runSignal("funding")}
          disabled={disabled || busyKey !== null}
        >
          {busyKey === "funding" ? "Sending…" : "Interested in funding"}
        </Button>
      </div>
      <div className="build-support-actions__connect">
        <Button type="button" variant="primary" onClick={() => void runConnect()} disabled={busyKey !== null}>
          {busyKey === "connect" ? "Opening…" : "Connect"}
        </Button>
      </div>
      {success ? (
        <p className="build-support-actions__success" role="status" aria-live="polite">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="build-support-actions__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
