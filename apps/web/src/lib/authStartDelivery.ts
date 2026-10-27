/**
 * POST /v1/auth/start tells us what happened to the email, so the code screen can say
 * exactly that (and never imply a second email that was not sent, or hide one that was).
 */
export type AuthStartDelivery = "sent" | "already_sent" | "unconfirmed";

export type AuthStartResponse = {
  challengeId: string;
  sentTo?: string;
  /** Missing from older API builds: treated as "sent". */
  delivery?: AuthStartDelivery;
  /** Seconds until another start would email a new code. Missing from older API builds. */
  resendAfterSeconds?: number;
};

/** Matches the API's default duplicate window when an older build does not send it. */
export const DEFAULT_RESEND_AFTER_SECONDS = 120;

export function deliveryOf(res: AuthStartResponse): AuthStartDelivery {
  return res.delivery === "already_sent" || res.delivery === "unconfirmed" ? res.delivery : "sent";
}

export function resendAfterMs(res: AuthStartResponse): number {
  const s = res.resendAfterSeconds;
  return (typeof s === "number" && Number.isFinite(s) && s >= 0 ? s : DEFAULT_RESEND_AFTER_SECONDS) * 1000;
}

export function sentHeadline(delivery: AuthStartDelivery): string {
  if (delivery === "already_sent") return "We already sent you a code";
  if (delivery === "unconfirmed") return "Your code is on its way";
  return "We've sent you a code";
}

export function sentBody(delivery: AuthStartDelivery, email: string): string {
  if (delivery === "already_sent") {
    return `We sent a code to ${email} a moment ago, so we didn't send another. Use the code or link in that email.`;
  }
  if (delivery === "unconfirmed") {
    return `We're sending a code to ${email}. It can take a minute to arrive. You can also open the magic link in the email.`;
  }
  return `We sent a one-time code to ${email}. You can also open the magic link in the email.`;
}

/** Shown after tapping Resend. */
export function resendNotice(delivery: AuthStartDelivery): string {
  if (delivery === "already_sent") return "We already sent a code a moment ago. Use that email.";
  if (delivery === "unconfirmed") return "New code on its way. Earlier codes no longer work.";
  return "New code sent. Earlier codes no longer work.";
}

/** "1:42" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
