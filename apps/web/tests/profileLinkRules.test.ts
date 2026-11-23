import { describe, it, expect } from 'vitest';
import { validateProfileLink, profileLinkDraft, uneditedProfileLinks, isXProfileLink } from '../src/lib/profileLinkRules';
const link = (platform: string, url: string) => ({ id: platform, platform, url, label: null });
describe('profile link field rules', () => {
  it('accepts and normalizes full social profile links', () => {
    expect(validateProfileLink('linkedin', '@sample-person').error).toBeTruthy();
    expect(validateProfileLink('linkedin', 'https://linkedin.com/in/sample-person/?trk=copy#about').url).toBe('https://www.linkedin.com/in/sample-person');
    expect(validateProfileLink('github', 'sample-user').error).toBeTruthy();
    expect(validateProfileLink('github', '@sample-user').error).toBeTruthy();
    expect(validateProfileLink('github', 'github.com/sample-user').error).toBeTruthy();
    expect(validateProfileLink('linkedin', 'linkedin.com/in/sample-person').error).toBeTruthy();
    expect(validateProfileLink('github', 'http://www.github.com/sample-user/').url).toBe('https://github.com/sample-user');
  });
  it('rejects mismatched domains, content links and unsafe URLs', () => {
    for (const value of ['https://linkedin.com.evil.com/in/sample', 'https://evil.com/?linkedin.com', 'linkedin.com/company/sample', 'javascript:alert(1)', 'https://user:pass@linkedin.com/in/sample']) expect(validateProfileLink('linkedin', value).error).toBeTruthy();
    for (const value of ['github.com/person/repo', 'github.com/login', 'github.com/a--b', 'https://github.com.evil.com/person']) expect(validateProfileLink('github', value).error).toBeTruthy();
  });
  it('allows optional portfolio sites without discarding paths or query strings', () => {
    expect(validateProfileLink('portfolio', 'sample.com/work?view=public#projects').url).toBe('https://sample.com/work?view=public#projects');
    expect(validateProfileLink('portfolio', 'http://sample.com').url).toBe('http://sample.com/');
    for (const value of ['@person', 'some words', 'javascript:alert(1)', 'https://user:pass@sample.com']) expect(validateProfileLink('portfolio', value).error).toBeTruthy();
    expect(validateProfileLink('portfolio', '')).toEqual({url:null,error:null});
  });
  it('keeps X out of drafts and legacy editing while preserving unrelated sites', () => {
    const x=link('Twitter','https://x.com/sample');
    const portfolio=link('Portfolio website','https://sample.com');
    expect(profileLinkDraft([x,portfolio])).toEqual({linkedin:'',github:'',portfolio:'https://sample.com'});
    expect(uneditedProfileLinks([x,link('Other','https://example.com')])).toHaveLength(1);
    expect(isXProfileLink(link('Website','https://prefix.com/me'))).toBe(false);
  });
});
