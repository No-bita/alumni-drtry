export interface AuthEmailPayload {
  to: string;
  otp: string;
  magicLinkUrl: string;
  otpExpiresAt: Date;
  magicLinkExpiresAt: Date;
}

export interface ContactRequestReceivedEmailPayload {
  to: string;
  recipientName: string;
  senderName: string;
  message: string;
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

export interface EmailSender {
  sendAuthEmail(payload: AuthEmailPayload): Promise<void>;
  sendContactRequestReceivedEmail(payload: ContactRequestReceivedEmailPayload): Promise<void>;
  sendContactRequestAcceptedEmail(payload: ContactRequestAcceptedEmailPayload): Promise<void>;
  sendContactRequestDeclinedEmail(payload: ContactRequestDeclinedEmailPayload): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
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

  async sendAuthEmail(payload: AuthEmailPayload): Promise<void> {
    const { subject, text, html } = buildAuthEmailContent(payload, this.options.brandName);
    await this.sendEmail(payload.to, subject, text, html);
  }

  async sendContactRequestReceivedEmail(
    payload: ContactRequestReceivedEmailPayload
  ): Promise<void> {
    const subject = `${payload.senderName} wants to connect on ${this.options.brandName}`;
    const text = [
      `Hi ${payload.recipientName},`,
      "",
      `${payload.senderName} sent you a contextual note:`,
      `"${payload.message}"`,
      "",
      "If you are interested, review and respond from your alumni dashboard."
    ].join("\n");
    const html = [
      `<p>Hi ${payload.recipientName},</p>`,
      `<p><strong>${payload.senderName}</strong> sent you a contextual note:</p>`,
      `<blockquote>${payload.message}</blockquote>`,
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

  private async sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend delivery failed (${response.status}): ${body}`);
    }
  }
}
