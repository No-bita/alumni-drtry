import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ botNumber: '919999999999' as string | null }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ status:'authenticated', myProfile:{ id:'member' } }) }));
vi.mock('../src/lib/whatsapp', () => ({ WHATSAPP_SETTINGS_KEY:['test-wa'], fetchWhatsAppSettings:async () => ({botNumber:state.botNumber}), whatsappChatUrl:(n:string)=>`https://wa.me/${n}` }));
import { WhatsAppFloatingButton } from '../src/components/WhatsAppFloatingButton';
import { isWhatsAppMainPage } from '../src/lib/whatsappMainPage';
afterEach(()=>{cleanup();state.botNumber='919999999999';});
const mount = () => render(<MemoryRouter initialEntries={['/home']}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><input aria-label="Question"/><WhatsAppFloatingButton /></QueryClientProvider></MemoryRouter>);
describe('main-page WhatsApp shortcut',()=>{
 it('limits placement to main pages, excluding composition, other profiles and admin',()=>{
  for(const path of ['/home','/events','/intent/career','/intent/business','/intent/location','/profiles/member']) expect(isWhatsAppMainPage(path,'member')).toBe(true);
  for(const path of ['/match','/login','/onboarding','/profiles/another','/admin','/wa']) expect(isWhatsAppMainPage(path,'member')).toBe(false);
 });
 it('opens the configured chat without changing opt-in and hides during typing/dialogs',async()=>{
  mount();const a=await screen.findByRole('link',{name:'Open Alma on WhatsApp'});
  expect(a.getAttribute('href')).toBe('https://wa.me/919999999999');
  fireEvent.focusIn(screen.getByLabelText('Question'));screen.getByLabelText('Question').focus();
  await waitFor(()=>expect(a.hidden).toBe(true));
  screen.getByLabelText('Question').blur();
  await waitFor(()=>expect(a.hidden).toBe(false));
  const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');document.body.append(modal);
  await waitFor(()=>expect(a.hidden).toBe(true));modal.remove();
  await waitFor(()=>expect(a.hidden).toBe(false));
 });
 it('does not show an unavailable bot',async()=>{
  state.botNumber=null;mount();await new Promise(r=>setTimeout(r,20));expect(screen.queryByRole('link')).toBeNull();
 });
});
