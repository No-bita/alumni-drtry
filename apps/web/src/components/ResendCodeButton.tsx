import { useEffect, useState } from "react";
import { formatCountdown } from "../lib/authStartDelivery";
import { Button } from "./Button";

type Props = {
  /** Epoch ms when the server will email a new code; before that a tap would send nothing. */
  availableAt: number;
  busy: boolean;
  onResend: () => void;
};

/**
 * "Resend code in 1:42", then "Resend code". Mirrors the server's duplicate window.
 * Give it `key={availableAt}` so a new target starts from a fresh clock reading.
 */
export function ResendCodeButton({ availableAt, busy, onResend }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = availableAt - now;

  useEffect(() => {
    if (availableAt - Date.now() <= 0) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (availableAt - t <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [availableAt]);

  const waiting = remaining > 0;
  return (
    <Button
      type="button"
      variant="secondary"
      className="login-gate-sent__resend"
      style={{ marginTop: 12, width: "100%" }}
      disabled={waiting || busy}
      onClick={onResend}
    >
      {busy ? "Sending…" : waiting ? `Resend code in ${formatCountdown(remaining)}` : "Resend code"}
    </Button>
  );
}
