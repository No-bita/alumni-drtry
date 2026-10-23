import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { OccupationView, ProfileLinkView, PublicProfileView } from '../../api/client';
import { Avatar } from '../Avatar';
import { openToDisplayItems, type OpenToPreferences } from '../../lib/openToPreferences';
import { formatOccupationCompanyTypeLine, formatOccupationDatesDurationLine, residenceLine, sortOccupationsForDisplay } from '../../lib/profileDisplay';
import './person-profile.css';

type Props = {
  profile: PublicProfileView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
  isOwnProfile: boolean;
  onboardingIncomplete: boolean;
  privateContact?: { personalEmail?: string | null; mobilePhone?: string | null };
  openTo: OpenToPreferences | null;
  onPreviewChange?: (preview: boolean) => void;
  onEdit: () => void;
  onSignOut: () => void;
};
function Icon({ kind }: { kind: 'edit'|'pin'|'eye'|'lock'|'mail'|'phone'|'share'|'exit'|'back'|'link' }) {
  const paths = {
    edit: 'M16 3l5 5-12 12-6 1 1-6ZM13 6l5 5',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    lock: 'M5 10h14v12H5ZM8 10V6a4 4 0 0 1 8 0v4',
    mail: 'M3 5h18v14H3ZM3 6l9 7 9-7',
    phone: 'M8 3l3 5-3 3c1 3 2 4 5 5l3-3 5 3-1 5C11 23 1 13 3 4Z',
    share: 'M12 16V2M7 7l5-5 5 5M5 11v10h14V11',
    exit: 'M10 3H3v18h7M8 12h14M17 7l5 5-5 5',
    back: 'M15 4l-8 8 8 8',
    link: 'M10 14l4-4M8 15l-2 2a4 4 0 0 0 6 5l3-3M16 9l2-2a4 4 0 0 0-6-5L9 5',
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
export function PersonProfileView({ profile, occupations, links, isOwnProfile, onboardingIncomplete, privateContact, openTo, onEdit, onSignOut, onPreviewChange }: Props) {
  const [preview, setPreview] = useState(false);
  const [shareStatus, setShareStatus] = useState('Share');
  const owner = isOwnProfile && !preview;
  const city = residenceLine(profile.residenceCity, profile.residenceCountry);
  const education = [profile.degreeName || profile.degreeCode, profile.departmentName || profile.departmentCode].filter(Boolean).join(' · ');
  const choices = openToDisplayItems(openTo);
  const sorted = sortOccupationsForDisplay(occupations);
  const edit = (label: string) => owner ? <button type="button" className="person-profile__edit" aria-label={label} onClick={onEdit}><Icon kind="edit" /></button> : null;
  const head = (label: string, control?: ReactNode) => <div className="person-profile__section-head"><h2>{label}</h2>{control}</div>;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: profile.fullName, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setShareStatus('Copied'); }
    } catch { setShareStatus('Share'); }
  };
  return <section className="person-profile" aria-label={`${profile.fullName}'s profile`}>
    <div className="person-profile__toolbar">
      {preview ? <button type="button" onClick={() => { setPreview(false); onPreviewChange?.(false); }}><Icon kind="back" />Back</button> : <Link to="/search"><Icon kind="back" />Directory</Link>}
      {isOwnProfile && !preview ? <button type="button" onClick={() => { setPreview(true); onPreviewChange?.(true); }}><Icon kind="eye" />Preview</button> : null}
    </div>
    <header className="person-profile__identity">
      <div className="person-profile__name-row"><div><p className="person-profile__cohort">IIT BHU{profile.batchYear ? ` · Class of ${profile.batchYear}` : ''}</p><h1>{profile.fullName}</h1></div><Avatar name={profile.fullName} size="md" /></div>
      {(education || city) ? <div className="person-profile__metadata"><span>{education}</span>{city ? <span><Icon kind="pin" />{city}</span> : null}</div> : null}
    </header>
    {preview ? <p className="person-profile__preview-label">Preview</p> : null}
    {owner ? <div className="person-profile__account-actions"><button type="button" onClick={onEdit}><Icon kind="edit" />Edit profile</button>{onboardingIncomplete ? <Link to="/onboarding">Finish your profile</Link> : null}</div> : null}
    {profile.bio?.trim() ? <section className="person-profile__about">{head('About')}<p>{profile.bio}</p></section> : null}
    {(choices.length > 0 || owner) ? <section className="person-profile__open-to">{head('Open to', edit('Edit Open to'))}{choices.length ? <ul>{choices.map(item => <li key={item.id}><span>{item.title}</span><p>{item.description}</p></li>)}</ul> : <p className="person-profile__muted">Nothing selected.</p>}</section> : null}
    {(sorted.length > 0 || owner) ? <section className="person-profile__path">{head('My path', edit('Edit experience'))}{sorted.length ? <ol>{sorted.map(occupation => <li key={occupation.id}><h3>{occupation.roleTitle}</h3>{formatOccupationCompanyTypeLine(occupation) ? <p>{formatOccupationCompanyTypeLine(occupation)}</p> : null}{formatOccupationDatesDurationLine(occupation) ? <small>{formatOccupationDatesDurationLine(occupation)}</small> : null}{occupation.description?.trim() ? <p>{occupation.description}</p> : null}</li>)}</ol> : <p className="person-profile__muted">No experience added.</p>}</section> : null}
    {(links.length > 0 || owner) ? <section className="person-profile__links">{head('Links', edit('Edit links'))}<div className="person-profile__link-row">{links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"><Icon kind="link" />{link.label || link.platform}</a>)}<button type="button" onClick={() => void share()}><Icon kind="share" />{shareStatus}</button></div></section> : <button type="button" className="person-profile__share" onClick={() => void share()}><Icon kind="share" />{shareStatus}</button>}
    {owner ? <section className="person-profile__contact">{head('Contact', edit('Edit contact details'))}<p className="person-profile__privacy"><Icon kind="lock" />Private · hidden from alumni</p><dl><div><dt><Icon kind="mail" />Personal email</dt><dd>{privateContact?.personalEmail || 'Not added'}</dd></div><div><dt><Icon kind="phone" />Phone</dt><dd>{privateContact?.mobilePhone || 'Not added'}</dd></div></dl></section> : null}
    {owner ? <button type="button" className="person-profile__signout" onClick={onSignOut}><Icon kind="exit" />Sign out</button> : null}
  </section>;
}
