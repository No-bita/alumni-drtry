import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '../src/lib/queryKeys';
import { Profile } from '../src/pages/Profile';
const profile = {id:'p1',fullName:'Sample Admin',departmentCode:'cse',departmentName:'Computer Science',degreeName:'BTech',batchYear:2020,onboardingCompletedAt:'2026-01-01'};
vi.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({status:'authenticated',person:{id:'p1',role:'admin',institutionalEmail:'sample@itbhu.ac.in'},myProfile:profile,refetch:vi.fn(),logout:vi.fn()})}));
vi.mock('../src/components/Nav',()=>({Nav:()=>null}));
// Exercise the page's preview/edit callbacks independently of the view's hidden
// owner buttons. Contact deep-link editing invokes the same beginEdit callback.
vi.mock('../src/components/profile/PersonProfileView',()=>({PersonProfileView:({onPreviewChange,onEdit}:{onPreviewChange:(preview:boolean)=>void;onEdit:()=>void})=><><button onClick={()=>onPreviewChange(true)}>Preview seam</button><button onClick={onEdit}>Begin contact edit seam</button></>}));
vi.mock('../src/api/client',()=>({api:{get:vi.fn(async()=>({data:{},error:null}))}}));
afterEach(cleanup);
describe('Profile preview/edit state',()=>{
 it('restores admin dashboard and email controls after editing exits preview then cancels',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
  client.setQueryData(queryKeys.profiles.detail('p1'),{profile,occupations:[],links:[]});
  client.setQueryData(queryKeys.me.links(),{links:[]});
  client.setQueryData(['admin-metrics','profile-dashboard'],{totalPeople:1,directoryMix:{},betaAuthFunnel:{},betaUsage:{},betaFunnel24h:{},betaKpis:{}});
  client.setQueryData(['admin-allowed-emails','profile-dashboard'],[]);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles/p1']}><Routes><Route path="/profiles/:id" element={<Profile/>}/></Routes></MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole('heading',{name:'Admin analytics dashboard'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Admin email allowlist'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Preview seam'}));
  expect(screen.queryByRole('heading',{name:'Admin analytics dashboard'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Begin contact edit seam'}));
  fireEvent.click(await screen.findByRole('button',{name:'Cancel',exact:true}));
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Admin analytics dashboard'})).toBeTruthy());
  expect(screen.getByRole('heading',{name:'Admin email allowlist'})).toBeTruthy();
  client.clear();
 });
});
