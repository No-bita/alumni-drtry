import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Profile} from '../src/pages/Profile';
const state=vi.hoisted(()=>({resolve:null as null|((v:unknown)=>void)}));
vi.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({status:'authenticated',person:{role:'alumni',institutionalEmail:'sample@itbhu.ac.in'},myProfile:{id:'p1',personalEmail:'saved@example.com',mobilePhone:'12345678',onboardingCompletedAt:'2026-01-01'},refetch:vi.fn(),logout:vi.fn()})}));
vi.mock('../src/components/Nav',()=>({Nav:()=>null}));
vi.mock('../src/lib/assertApiGet',()=>({assertApiGet:vi.fn((path:string)=>path.startsWith('/v1/profiles/')?new Promise(resolve=>{state.resolve=resolve}):Promise.resolve({links:[]}))}));
function Where(){return <div data-testid="url">{useLocation().search}</div>}
afterEach(cleanup);
it('keeps contact edit pending until profile loads, then hydrates drafts before editing',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles/p1?edit=contact']}><Where/><Routes><Route path="/profiles/:id" element={<Profile/>}/></Routes></MemoryRouter></QueryClientProvider>);
 await act(async()=>{await new Promise(r=>setTimeout(r,25))});
 expect(screen.getByTestId('url').textContent).toBe('?edit=contact');
 expect(screen.queryByRole('button',{name:'Save',exact:true})).toBeNull();
 await act(async()=>{state.resolve?.({profile:{id:'p1',fullName:'Sample Alum',departmentCode:'cse',degreeName:'BTech',batchYear:2020,residenceCity:'Bengaluru',residenceCountry:'India',openToPreferences:{selected:['coffee'],descriptions:{coffee:'Saved context'}}},occupations:[],links:[]})});
 await screen.findByRole('button',{name:'Save',exact:true});
 await waitFor(()=>expect(screen.getByTestId('url').textContent).toBe(''));
 expect((screen.getByLabelText('City of residence (optional)') as HTMLInputElement).value).toBe('Bengaluru');
 expect((screen.getByLabelText('Country of residence (optional)') as HTMLInputElement).value).toBe('India');
 expect((screen.getByLabelText('Personal email (optional)') as HTMLInputElement).value).toBe('saved@example.com');
 expect(screen.getByText('Choose up to 5 (1/5 selected)')).toBeTruthy();
 client.clear();
});
