export interface AuthEmailPayload {
  to: string;
  otp: string;
  magicLinkUrl: string;
  otpExpiresAt: Date;
  magicLinkExpiresAt: Date;
}

export interface ContactRequestReminderEmailPayload {
  to: string;
  recipientName: string;
  senderName: string;
  message: string;
  /** Whole days since the note was sent. */
  daysWaiting: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildContactRequestReminderEmail(
  payload: ContactRequestReminderEmailPayload,
  brandName: string
): { subject: string; text: string; html: string } {
  const days = payload.daysWaiting === 1 ? "1 day" : `${payload.daysWaiting} days`;
  const subject = `Reminder: ${payload.senderName} is waiting on your reply on ${brandName}`;
  const text = [
    `Hi ${payload.recipientName},`,
    "",
    `${payload.senderName} sent you a note ${days} ago and hasn't heard back yet:`,
    `"${payload.message}"`,
    "",
    "You can accept or decline from your notifications. This is the only reminder we'll send for this note."
  ].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(payload.recipientName)},</p>`,
    `<p><strong>${escapeHtml(payload.senderName)}</strong> sent you a note ${days} ago and hasn't heard back yet:</p>`,
    `<blockquote>${escapeHtml(payload.message)}</blockquote>`,
    "<p>You can accept or decline from your notifications. This is the only reminder we'll send for this note.</p>"
  ].join("");
  return { subject, text, html };
}

export interface ContactRequestReceivedEmailPayload {
  to: string;
  recipientName: string;
  senderName: string;
  message: string;
  /** What the sender did, e.g. "asked you for coffee" (Cities notes). Default: "sent you a contextual note". */
  lead?: string;
}

export interface ContactRequestAcceptedEmailPayload {
  to: string;
  senderName: string;
  recipientName: string;
  sharedContact: string;
}

export interface ContactRequestDeclinedEmailPayload {
  to: string;
  senderName: string;
  recipientName: string;
}

export interface IntentcastResponseReceivedEmailPayload {
  to: string;
  authorName: string;
  responderName: string;
  postContent: string;
  responseMessage: string;
}

/**
 * The provider never answered (timeout, dropped connection), so the email may or may not
 * have gone out. Auth start keeps the challenge for these: its code stays valid if it arrives.
 * A non-2xx answer is a clear rejection and is thrown as a plain Error instead.
 */
export class EmailDeliveryUnconfirmedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryUnconfirmedError";
  }
}

const NEVER_CONNECTED_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

/** True when fetch failed before any byte reached the provider (undici puts the reason on `cause`). */
export function neverConnected(err: unknown): boolean {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" && NEVER_CONNECTED_CODES.has(cause.code);
}

/** fetch never connected to the provider (DNS failure, refused): nothing was sent. */
export class EmailUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailUnreachableError";
  }
}

/** Cities v1 weekly "what's new in your city" email. */
export interface CityNudgeEmailPayload {
  to: string;
  recipientName: string;
  city: string;
  subject: string;
  arrivals: Array<{
    name: string;
    batchYear: number | null;
    department: string | null;
    roleTitle: string | null;
    organizationName: string | null;
    previousCity: string | null;
  }>;
  /** "[N] moving-help searches for …" (null when under 3). */
  askCount: number | null;
  /** Show "Turn on city help" (recipient doesn't have it). */
  showCityHelp: boolean;
  /** Titles of new city plans (first line of each post). */
  plans: string[];
  pageUrl: string;
  manageUrl: string;
}

/** Body for the nudge email: each section only when it has something. Never mentions anyone's notes. */
export function buildCityNudgeEmail(p: CityNudgeEmailPayload, brandName: string): { subject: string; text: string; html: string } {
  const yy = (y: number | null) => (y ? `'${String(y).slice(-2)}` : "");
  const arrivalLine = (a: CityNudgeEmailPayload["arrivals"][number]) => {
    const head = [a.name, [yy(a.batchYear), a.department].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    const job = a.roleTitle ? (a.organizationName ? `${a.roleTitle} at ${a.organizationName}` : a.roleTitle) : null;
    const tail = [job, a.previousCity ? `from ${a.previousCity}` : null].filter(Boolean).join(" · ");
    return { head, tail };
  };
  const text: string[] = [`Hi ${p.recipientName},`, "", `What's new in ${p.city}`];
  const html: string[] = [`<p>Hi ${escapeHtml(p.recipientName)},</p>`, `<h2>What's new in ${escapeHtml(p.city)}</h2>`];
  if (p.arrivals.length > 0) {
    text.push("", "New in town", `They asked to be shown to ${p.city} alumni.`);
    html.push(`<h3>New in town</h3><p>They asked to be shown to ${escapeHtml(p.city)} alumni.</p><ul>`);
    for (const a of p.arrivals) {
      const { head, tail } = arrivalLine(a);
      text.push(`- ${head}${tail ? ` (${tail})` : ""}`);
      html.push(`<li><strong>${escapeHtml(head)}</strong>${tail ? `<br>${escapeHtml(tail)}` : ""}</li>`);
    }
    text.push(`Offer to help: ${p.pageUrl}`);
    html.push(`</ul><p><a href="${escapeHtml(p.pageUrl)}">Offer to help</a></p>`);
  }
  if (p.askCount !== null) {
    text.push("", `${p.askCount} moving-help searches for ${p.city}`);
    html.push(`<h3>${p.askCount} moving-help searches for ${escapeHtml(p.city)}</h3>`);
    if (p.showCityHelp) {
      text.push(`Turn on city help and you'll be one of the first alumni they see: ${p.pageUrl}`);
      html.push(`<p>Turn on city help and you'll be one of the first alumni they see. <a href="${escapeHtml(p.pageUrl)}">Turn on city help</a></p>`);
    }
  }
  if (p.plans.length > 0) {
    text.push("", "Plans this week", p.plans.join(" · "));
    html.push(`<h3>Plans this week</h3><p>${p.plans.map(escapeHtml).join(" · ")}</p>`);
  }
  text.push("", `Sent only when something's new in your city. Change how often or stop these emails: ${p.manageUrl}`);
  html.push(
    `<hr><p style="font-size:12px">Sent only when something's new in your city. <a href="${escapeHtml(p.manageUrl)}">Change how often</a> · <a href="${escapeHtml(p.manageUrl)}">Stop these emails</a></p>`
  );
  return { subject: p.subject || `What's new in ${p.city} on ${brandName}`, text: text.join("\n"), html: html.join("") };
}

export interface EmailSender {
  sendAuthEmail(payload: AuthEmailPayload): Promise<void>;
  sendContactRequestReceivedEmail(payload: ContactRequestReceivedEmailPayload): Promise<void>;
  sendContactRequestAcceptedEmail(payload: ContactRequestAcceptedEmailPayload): Promise<void>;
  sendContactRequestDeclinedEmail(payload: ContactRequestDeclinedEmailPayload): Promise<void>;
  sendContactRequestReminderEmail(payload: ContactRequestReminderEmailPayload): Promise<void>;
  sendIntentcastResponseReceivedEmail(
    payload: IntentcastResponseReceivedEmailPayload
  ): Promise<void>;
  sendCityNudgeEmail(payload: CityNudgeEmailPayload): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async sendCityNudgeEmail(payload: CityNudgeEmailPayload): Promise<void> {
    process.stdout.write(
      `[mail] to=${payload.to} type=city_nudge city="${payload.city}" subject="${payload.subject}" arrivals=${payload.arrivals.length} plans=${payload.plans.length}\n`
    );
  }

  async sendAuthEmail(payload: AuthEmailPayload): Promise<void> {
    const redactedOtp = payload.otp.replace(/\d(?=\d{2})/g, "*");
    process.stdout.write(
      `[mail] to=${payload.to} otp=${redactedOtp} otp_exp=${payload.otpExpiresAt.toISOString()} link_exp=${payload.magicLinkExpiresAt.toISOString()} link=${payload.magicLinkUrl}\n`
    );
  }

  async sendContactRequestReceivedEmail(payload: ContactRequestReceivedEmailPayload): Promise<void> {
    process.stdout.write(
      `[mail] to=${payload.to} type=contact_request_received sender="${payload.senderName}" recipient="${payload.recipientName}" message="${payload.message}"\n`
    );
  }

  async sendContactRequestAcceptedEmail(payload: ContactRequestAcceptedEmailPayload): Promise<void> {
    process.stdout.write(
      `[mail] to=${payload.to} type=contact_request_accepted sender="${payload.senderName}" recipient="${payload.recipientName}" shared_contact="${payload.sharedContact}"\n`
    );
  }

  async sendContactRequestDeclinedEmail(payload: ContactRequestDeclinedEmailPayload): Promise<void> {
    process.stdout.write(
      `[mail] to=${payload.to} type=contact_request_declined sender="${payload.senderName}" recipient="${payload.recipientName}"\n`
    );
  }

  async sendContactRequestReminderEmail(payload: ContactRequestReminderEmailPayload): Promise<void> {
    process.stdout.write(
      `[mail] to=${payload.to} type=contact_request_reminder sender="${payload.senderName}" recipient="${payload.recipientName}" days_waiting=${payload.daysWaiting}\n`
    );
  }

  async sendIntentcastResponseReceivedEmail(
    payload: IntentcastResponseReceivedEmailPayload
  ): Promise<void> {
    process.stdout.write(
      `[mail] to=${payload.to} type=intentcast_response_received author="${payload.authorName}" responder="${payload.responderName}" post="${payload.postContent}" response="${payload.responseMessage}"\n`
    );
  }
}

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
  replyTo?: string;
  brandName: string;
}

function buildAuthEmailContent(payload: AuthEmailPayload, brandName: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Your ${brandName} sign-in link and OTP`;
  const text = [
    `Your one-time password is: ${payload.otp}`,
    "",
    `OTP expires at: ${payload.otpExpiresAt.toISOString()}`,
    `Magic link expires at: ${payload.magicLinkExpiresAt.toISOString()}`,
    "",
    `Magic link: ${payload.magicLinkUrl}`,
    "",
    "If you did not request this login, ignore this email."
  ].join("\n");

  const html = [
    "<p>Your one-time password is:</p>",
    `<p><strong style="font-size:20px;letter-spacing:2px;">${payload.otp}</strong></p>`,
    `<p>OTP expires at: ${payload.otpExpiresAt.toISOString()}</p>`,
    `<p>Magic link expires at: ${payload.magicLinkExpiresAt.toISOString()}</p>`,
    `<p><a href="${payload.magicLinkUrl}">Sign in with magic link</a></p>`,
    "<p>If you did not request this login, ignore this email.</p>"
  ].join("");

  return { subject, text, html };
}

export class ResendEmailSender implements EmailSender {
  constructor(private readonly options: ResendEmailSenderOptions) {}

  async sendCityNudgeEmail(payload: CityNudgeEmailPayload): Promise<void> {
    const { subject, text, html } = buildCityNudgeEmail(payload, this.options.brandName);
    await this.sendEmail(payload.to, subject, text, html);
  }

  async sendAuthEmail(payload: AuthEmailPayload): Promise<void> {
    const { subject, text, html } = buildAuthEmailContent(payload, this.options.brandName);
    // Bounded wait, auth-specific: auth-start holds a per-email DB lock across the send,
    // so a hanging provider must not stall same-email starts indefinitely. Other email
    // types keep their existing unbounded behavior. On timeout this throws and auth
    // start rolls the challenge back as a retryable AUTH_DELIVERY_FAILED.
    await this.sendEmail(payload.to, subject, text, html, 10_000);
  }

  async sendContactRequestReceivedEmail(
    payload: ContactRequestReceivedEmailPayload
  ): Promise<void> {
    const subject = payload.lead
      ? `${payload.senderName} ${payload.lead} on ${this.options.brandName}`
      : `${payload.senderName} wants to connect on ${this.options.brandName}`;
    const lead = payload.lead ?? "sent you a contextual note";
    const text = [
      `Hi ${payload.recipientName},`,
      "",
      `${payload.senderName} ${lead}:`,
      `"${payload.message}"`,
      "",
      "If you are interested, review and respond from your alumni dashboard."
    ].join("\n");
    const html = [
      `<p>Hi ${escapeHtml(payload.recipientName)},</p>`,
      `<p><strong>${escapeHtml(payload.senderName)}</strong> ${escapeHtml(lead)}:</p>`,
      `<blockquote>${escapeHtml(payload.message)}</blockquote>`,
      "<p>If you are interested, review and respond from your alumni dashboard.</p>"
    ].join("");
    await this.sendEmail(payload.to, subject, text, html);
  }

  async sendContactRequestAcceptedEmail(
    payload: ContactRequestAcceptedEmailPayload
  ): Promise<void> {
    const subject = `${payload.recipientName} accepted your request on ${this.options.brandName}`;
    const text = [
      `Hi ${payload.senderName},`,
      "",
      `${payload.recipientName} accepted your connection request.`,
      `Contact shared: ${payload.sharedContact}`
    ].join("\n");
    const html = [
      `<p>Hi ${payload.senderName},</p>`,
      `<p><strong>${payload.recipientName}</strong> accepted your connection request.</p>`,
      `<p>Contact shared: <strong>${payload.sharedContact}</strong></p>`
    ].join("");
    await this.sendEmail(payload.to, subject, text, html);
  }

  async sendContactRequestReminderEmail(payload: ContactRequestReminderEmailPayload): Promise<void> {
    const { subject, text, html } = buildContactRequestReminderEmail(payload, this.options.brandName);
    await this.sendEmail(payload.to, subject, text, html);
  }

  async sendContactRequestDeclinedEmail(
    payload: ContactRequestDeclinedEmailPayload
  ): Promise<void> {
    const subject = `${payload.recipientName} declined your request on ${this.options.brandName}`;
    const text = [
      `Hi ${payload.senderName},`,
      "",
      `${payload.recipientName} declined your connection request.`
    ].join("\n");
    const html = [
      `<p>Hi ${payload.senderName},</p>`,
      `<p><strong>${payload.recipientName}</strong> declined your connection request.</p>`
    ].join("");
    await this.sendEmail(payload.to, subject, text, html);
  }

  async sendIntentcastResponseReceivedEmail(
    payload: IntentcastResponseReceivedEmailPayload
  ): Promise<void> {
    const subject = `New response to your bulletin post on ${this.options.brandName}`;
    const text = [
      `Hi ${payload.authorName},`,
      "",
      `${payload.responderName} responded to your bulletin post:`,
      `"${payload.postContent}"`,
      "",
      `Response: "${payload.responseMessage}"`,
      "",
      "Open your alumni dashboard to continue the conversation."
    ].join("\n");
    const html = [
      `<p>Hi ${payload.authorName},</p>`,
      `<p><strong>${payload.responderName}</strong> responded to your bulletin post:</p>`,
      `<blockquote>${payload.postContent}</blockquote>`,
      `<p>Response:</p>`,
      `<blockquote>${payload.responseMessage}</blockquote>`,
      "<p>Open your alumni dashboard to continue the conversation.</p>"
    ].join("");
    await this.sendEmail(payload.to, subject, text, html);
  }

  private async sendEmail(to: string, subject: string, text: string, html: string, timeoutMs?: number): Promise<void> {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        ...(timeoutMs !== undefined ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [to],
          subject,
          text,
          html,
          ...(this.options.replyTo ? { reply_to: this.options.replyTo } : {})
        })
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Never connected (DNS failure, refused): nothing reached Resend, so nothing was sent.
      if (neverConnected(err)) throw new EmailUnreachableError(`Resend unreachable: ${detail}`);
      // Otherwise no answer came back: Resend may have accepted it before the wait ran out.
      throw new EmailDeliveryUnconfirmedError(`Resend did not answer: ${detail}`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend delivery failed (${response.status}): ${body}`);
    }
  }
}
