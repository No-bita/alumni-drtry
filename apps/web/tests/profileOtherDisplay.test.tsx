import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePageView } from '../src/components/profile/ProfilePageView';
import { profileDepartmentDisplay } from '../src/lib/profileDisplay';
import type { PublicProfileView } from '../src/api/client';

// These shapes mirror discoveryRepo's public/owner SQL projections. Public
// approved Other rows have NO code, name, or review status, only approved text.
const publicApproved: PublicProfileView = {
  id: 'p1', fullName: 'Sample Alum', degreeName: 'BTech', batchYear: 2020,
  parsedJoiningYear: 2016, residenceCountry: null, residenceCity: null,
  departmentCode: null, departmentName: null, departmentOtherText: 'Applied Mechanics',
  departmentOtherStatus: null, institutionName: 'IIT (BHU) Varanasi',
};
const ownerProfile = (status: PublicProfileView['departmentOtherStatus']): PublicProfileView => ({
  ...publicApproved, departmentCode: 'other', departmentOtherStatus: status,
});
function mount(profile: PublicProfileView, own = false) {
  return render(<MemoryRouter><ProfilePageView profile={profile} occupations={[]} links={[]} areas={[]} openTo={null} yourNote={null}
    isOwnProfile={own} onboardingIncomplete={false} onEdit={vi.fn()} onReachOut={vi.fn()} onSignOut={vi.fn()} /></MemoryRouter>);
}
const education = () => within(screen.getByRole('region', { name: 'Education' }));
afterEach(cleanup);
describe('API-shaped Other department profile display', () => {
  it('shows approved text in Education when public code/name are redacted', () => {
    mount(publicApproved);
    expect(education().getByText('BTech, Applied Mechanics')).toBeTruthy();
    expect(screen.queryByText(/OTHER/)).toBeNull();
  });
  it.each(['pending', 'rejected'] as const)('keeps %s text visible to the owner', status => {
    mount(ownerProfile(status), true);
    expect(education().getByText('BTech, Applied Mechanics')).toBeTruthy();
  });
  it('retains approved text for the owner', () => {
    mount(ownerProfile('approved'), true);
    expect(education().getByText('BTech, Applied Mechanics')).toBeTruthy();
  });
  it('does not invent or expose text absent from the public pending/rejected API response', () => {
    mount({ ...publicApproved, departmentOtherText: null });
    expect(education().getByText('BTech')).toBeTruthy();
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
    expect(education().getByText('BTech, Computer Science')).toBeTruthy();
  });
});
