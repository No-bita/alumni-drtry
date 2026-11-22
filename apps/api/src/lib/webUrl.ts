/**
 * An ordinary web link: http or https, a real host name, no spaces. Anything else (javascript:,
 * data:, mailto:, file:, a bare word) is refused. Used for every link members save.
 */
export function isWebUrl(value: string, maxLength: number): boolean {
  if (value.length === 0 || value.length > maxLength || !/^https?:\/\//i.test(value) || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Longest profile link we store (matches the API's request limit). */
export const PROFILE_LINK_URL_MAX = 2048;
