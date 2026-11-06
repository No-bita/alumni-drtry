import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonProfileView } from '../src/components/profile/PersonProfileView';
import { ProfileHero } from '../src/components/profile/ProfileHero';
import { profileDepartmentDisplay } from '../src/lib/profileDisplay';
import type { PublicProfileView } from '../src/api/client';

// These shapes mirror discoveryRepo's public/owner SQL projections. Public
// approved Other rows have NO code, name, or review status, only approved text.
const publicApproved: PublicProfileView = {
  id: 'p1', fullName: 'Sample Alum', degreeName: 'BTech', batchYear: 2020,
  parsedJoiningYear: 2016, bio: null, residenceCountry: null, residenceCity: null,
  departmentCode: null, departmentName: null, departmentOtherText: 'Applied Mechanics',
  departmentOtherStatus: null,
};
const ownerProfile = (status: PublicProfileView['departmentOtherStatus']): PublicProfileView => ({
  ...publicApproved, departmentCode: 'other', departmentOtherStatus: status,
});
function mount(profile: PublicProfileView, own = false) {
  return render(<MemoryRouter><PersonProfileView profile={profile} occupations={[]} links={[]}
    isOwnProfile={own} onboardingIncomplete={false} openTo={null} onEdit={vi.fn()} onSignOut={vi.fn()} /></MemoryRouter>);
}
afterEach(cleanup);
describe('API-shaped Other department profile display', () => {
  it('shows approved text in the active public profile when public code/name are redacted', () => {
    mount(publicApproved);
    expect(screen.getByText('BTech · Applied Mechanics')).toBeTruthy();
    expect(screen.queryByText(/OTHER/)).toBeNull();
  });
  it.each(['pending', 'rejected'] as const)('keeps %s text owner-only, hiding it in Preview and restoring on Back', status => {
    mount(ownerProfile(status), true);
    expect(screen.getByText('BTech · Applied Mechanics')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.queryByText(/Applied Mechanics/)).toBeNull();
    expect(screen.queryByText(/other/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('BTech · Applied Mechanics')).toBeTruthy();
  });
  it('retains approved text in owner Preview', () => {
    mount(ownerProfile('approved'), true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('BTech · Applied Mechanics')).toBeTruthy();
  });
  it('does not invent or expose text absent from the public pending/rejected API response', () => {
    mount({ ...publicApproved, departmentOtherText: null });
    expect(screen.getByText('BTech')).toBeTruthy();
    expect(screen.queryByText(/Applied Mechanics|Other/i)).toBeNull();
  });
  it('defensively hides explicitly unapproved text from a non-owner', () => {
    mount(ownerProfile('pending'));
    expect(screen.queryByText(/Applied Mechanics/)).toBeNull();
  });
  it('does not replace a known department with stale Other text', () => {
    const known = { ...publicApproved, departmentCode: 'cse', departmentName: 'Computer Science' };
    expect(profileDepartmentDisplay(known)).toBe('Computer Science');
    mount(known);
    expect(screen.getByText('BTech · Computer Science')).toBeTruthy();
  });
  it('renders the same API-shaped public approved text in ProfileHero', () => {
    render(<MemoryRouter><ProfileHero profile={publicApproved} loading={false} occupations={[]} links={[]}
      profileDisplayName="Sample Alum" isOwnProfile={false} /></MemoryRouter>);
    expect(screen.getByText(/BTech, Applied Mechanics/)).toBeTruthy();
  });
  it('lets Hero owners see pending text but not non-owners', () => {
    const profile = ownerProfile('pending');
    const { rerender } = render(<MemoryRouter><ProfileHero profile={profile} loading={false} occupations={[]} links={[]}
      profileDisplayName="Sample Alum" isOwnProfile={true} /></MemoryRouter>);
    expect(screen.getByText(/Applied Mechanics/)).toBeTruthy();
    rerender(<MemoryRouter><ProfileHero profile={profile} loading={false} occupations={[]} links={[]}
      profileDisplayName="Sample Alum" isOwnProfile={false} /></MemoryRouter>);
    expect(screen.queryByText(/Applied Mechanics/)).toBeNull();
  });
});
