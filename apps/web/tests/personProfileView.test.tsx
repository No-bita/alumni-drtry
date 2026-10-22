import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonProfileView } from '../src/components/profile/PersonProfileView';
import type { PublicProfileView } from '../src/api/client';
const profile: PublicProfileView = { id:'p1',fullName:'Sample Alum',departmentCode:'cse',departmentName:'Computer Science',degreeName:'BTech',batchYear:2020,parsedJoiningYear:2016,bio:'A saved introduction.\nA second line.',residenceCountry:'India',residenceCity:'Bengaluru' };
function mount(own = true, overrides = {}) {
 const onEdit=vi.fn(), onSignOut=vi.fn(), onPreviewChange=vi.fn();
 render(<MemoryRouter><PersonProfileView profile={profile} occupations={[]} links={[{id:'x',platform:'Personal site',url:'https://example.com',label:'My site'}]} isOwnProfile={own} onboardingIncomplete={false} privateContact={{personalEmail:'private@example.com',mobilePhone:'+91 1234567890'}} openTo={{selected:['coffee'],descriptions:{coffee:'Ask me about local events'}}} onEdit={onEdit} onSignOut={onSignOut} onPreviewChange={onPreviewChange} {...overrides}/></MemoryRouter>);
 return {onEdit,onSignOut,onPreviewChange};
}
afterEach(cleanup);
describe('Person profile view',()=>{
 it('preserves saved bio verbatim and education once without joining year',()=>{ mount(); expect(screen.getByText(/A saved introduction/).textContent).toBe(profile.bio); expect(screen.getAllByText('BTech · Computer Science')).toHaveLength(1); expect(screen.queryByText(/2016/)).toBeNull(); });
 it('preserves full editor access, custom links and Open to descriptions',()=>{ const {onEdit}=mount(); fireEvent.click(screen.getByRole('button',{name:'Edit profile'})); expect(onEdit).toHaveBeenCalledTimes(1); expect(screen.getByRole('link',{name:'My site'}).getAttribute('href')).toBe('https://example.com'); expect(screen.getByText('Ask me about local events')).toBeTruthy(); });
 it('preview hides private contacts and every owner control and restores on return',()=>{ const {onPreviewChange}=mount(); fireEvent.click(screen.getByRole('button',{name:'Preview'})); expect(onPreviewChange).toHaveBeenCalledWith(true); expect(screen.queryByText('private@example.com')).toBeNull(); expect(screen.queryByText('+91 1234567890')).toBeNull(); expect(screen.queryByRole('button',{name:'Sign out'})).toBeNull(); expect(screen.queryByRole('button',{name:'Edit profile'})).toBeNull(); expect(screen.queryByRole('button',{name:'Edit Open to'})).toBeNull(); fireEvent.click(screen.getByRole('button',{name:'Back'})); expect(screen.getByText('private@example.com')).toBeTruthy(); });
 it('other alumni never receive contact or owner controls',()=>{ mount(false); expect(screen.queryByText('private@example.com')).toBeNull(); expect(screen.queryByRole('button',{name:'Preview'})).toBeNull(); expect(screen.queryByRole('button',{name:'Edit contact details'})).toBeNull(); });
 it('keeps sign out functional and onboarding conditional',()=>{ const {onSignOut}=mount(true,{onboardingIncomplete:true}); fireEvent.click(screen.getByRole('button',{name:'Sign out'})); expect(onSignOut).toHaveBeenCalledTimes(1); expect(screen.getByRole('link',{name:'Finish your profile'}).getAttribute('href')).toBe('/onboarding'); });
 it('does not fabricate missing bio, choices or experience for an alumni view',()=>{ mount(false,{profile:{...profile,bio:null},openTo:null,links:[]}); expect(screen.queryByRole('heading',{name:'About'})).toBeNull(); expect(screen.queryByRole('heading',{name:'Open to'})).toBeNull(); expect(screen.queryByRole('heading',{name:'My path'})).toBeNull(); });
});
