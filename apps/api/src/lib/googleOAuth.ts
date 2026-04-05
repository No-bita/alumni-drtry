import { AppError } from "./errors.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";

export function buildGoogleAuthorizationUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  /**
   * Google Workspace “hosted domain” hint (`hd`). Account picker favors that org; only one domain per request.
   * Consumer Gmail accounts are not limited by this — server still enforces ALLOWED_EMAIL_DOMAINS on the token email.
   */
  hostedDomain?: string;
}): string {
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  if (opts.hostedDomain) {
    u.searchParams.set("hd", opts.hostedDomain);
  }
  return u.toString();
}

export async function exchangeGoogleAuthorizationCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<string> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code"
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    throw new AppError(401, "AUTH_GOOGLE_TOKEN", "Could not complete Google sign-in. Try again.");
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new AppError(401, "AUTH_GOOGLE_TOKEN", "Could not complete Google sign-in. Try again.");
  }
  return json.access_token;
}

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new AppError(401, "AUTH_GOOGLE_USERINFO", "Could not read Google profile. Try again.");
  }
  return (await res.json()) as GoogleUserInfo;
}
