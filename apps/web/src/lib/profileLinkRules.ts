import type { ProfileLinkView } from '../api/client';
import { PROFILE_LINK_URL_MAX, isWebUrl } from './webUrl';

export const PROFILE_LINK_FIELDS = ['linkedin', 'github', 'portfolio'] as const;
export type ProfileLinkField = (typeof PROFILE_LINK_FIELDS)[number];
export const PROFILE_LINK_LABELS = { linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio website' };
export const PROFILE_LINK_HINTS = { linkedin: 'https://www.linkedin.com/in/your-name', github: 'https://github.com/your-name', portfolio: 'yourname.com or https://yourname.com' };
export type LinkDraft = Record<ProfileLinkField, string>;

export function isXProfileLink(link: ProfileLinkView): boolean {
  const label = link.platform.trim().toLowerCase();
  if (["x", "twitter", "x (twitter)", "x/twitter"].includes(label)) return true;
  try { return ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(new URL(link.url).hostname.toLowerCase()); } catch { return false; }
}
export function editableLinkKind(link: ProfileLinkView): ProfileLinkField | null {
  if (isXProfileLink(link)) return null;
  const platform = link.platform.trim().toLowerCase();
  if (platform === 'linkedin') return 'linkedin';
  if (platform === 'github') return 'github';
  if (['portfolio', 'portfolio website', 'website', 'personal website'].includes(platform)) return 'portfolio';
  return null;
}
export function profileLinkDraft(links: ProfileLinkView[]): LinkDraft {
  const draft: LinkDraft = { linkedin: '', github: '', portfolio: '' };
  for (const link of links) {
    const key = editableLinkKind(link);
    if (key && !draft[key]) draft[key] = link.url;
  }
  return draft;
}
export function uneditedProfileLinks(links: ProfileLinkView[]): ProfileLinkView[] {
  const seen = new Set<ProfileLinkField>();
  return links.filter(link => {
    if (isXProfileLink(link)) return false;
    const key = editableLinkKind(link);
    if (!key || seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}
export function validateProfileLink(field: ProfileLinkField, raw: string): { url: string | null; error: string | null } {
  const value = raw.trim();
  if (!value) return { url: null, error: null };
  const fail = (error: string) => ({ url: null, error });
  const message = field === 'linkedin' ? 'Paste your full LinkedIn profile link, such as https://www.linkedin.com/in/your-name.' : field === 'github' ? 'Paste your full GitHub profile link, such as https://github.com/your-name.' : 'Enter a website address, such as yourname.com. Use http or https.';
  if (/\s/.test(value) || value.includes('\\') || value.length > PROFILE_LINK_URL_MAX) return fail(message);
  let candidate = value;
  if (field !== 'portfolio' && !/^https?:\/\//i.test(candidate)) return fail(message);
  if (field === 'portfolio' && !/^[a-z][a-z\d+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
  let url: URL;
  try { url = new URL(candidate); } catch { return fail(message); }
  if (!isWebUrl(candidate, PROFILE_LINK_URL_MAX) || url.username || url.password || url.port) return fail(message);
  const host = url.hostname.toLowerCase();
  if (field === 'portfolio') {
    if (isXProfileLink({ id: '', platform: '', url: url.toString(), label: null })) return fail('Use your portfolio website, not an X/Twitter link.');
    // Keep website paths and meaningful queries: they may be needed by hosted portfolios.
    return { url: url.toString(), error: null };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (field === 'linkedin') {
    if (!['linkedin.com', 'www.linkedin.com'].includes(host) || parts.length !== 2 || parts[0] !== 'in' || !/^[a-zA-Z0-9_%-]+$/.test(parts[1]!)) return fail(message);
    return { url: `https://www.linkedin.com/in/${parts[1]}`, error: null };
  }
  const reserved = new Set(['login', 'signup', 'join', 'settings', 'explore', 'topics', 'trending', 'features', 'marketplace', 'organizations', 'orgs', 'about', 'pricing', 'search', 'contact', 'sponsors', 'collections', 'events', 'notifications', 'new', 'codespaces', 'pulls', 'issues', 'dashboard', 'security', 'site', 'enterprise']);
  const username = parts[0] ?? '';
  if (!['github.com', 'www.github.com'].includes(host) || parts.length !== 1 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username) || username.includes('--') || reserved.has(username.toLowerCase())) return fail(message);
  return { url: `https://github.com/${username}`, error: null };
}
