// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProfileSettingsPage from '../../../../app/profile-settings/page';

const session=vi.hoisted(()=>({signedIn:false}));
vi.mock('@/hooks/profile/useProfileData', () => ({
  useProfileData: () => ({
    user: session.signedIn ? {id:'person',name:'Mira',email:'mira@example.test',college:'Former college',profilePhoto:'',isCollegeVerified:false,isDriverVerified:false,totalRides:0} : null,
    vehicles: [], bookings: [], preferences: {}, safetySettings: {},
    securitySettings: {}, loading: false, error: session.signedIn?null:'Not found',
    savePreferences: vi.fn(), saveSafety: vi.fn(),
    refetch: { user: vi.fn(), vehicles: vi.fn(), bookings: vi.fn(), profileDomains: vi.fn() },
  }),
}));
vi.mock('@/hooks/auth/useUserProfile', () => ({ useUserProfile: () => ({ updateProfile: vi.fn() }) }));
vi.mock('@/hooks/auth/useCurrentUser', () => ({ useCurrentUser: () => ({ user: session.signedIn?{id:'person'}:null, loading: false }) }));
vi.mock('@/lib/api/client',()=>({apiRequest:async(path:string)=>path.includes('adult-declaration')
  ? {declaration:{state:'current',restriction_source:null}}
  : {driver:{state:'missing',restricted:false},vehicles:[]}}));

afterEach(()=>{cleanup();session.signedIn=false;});

it('offers sign-in when a signed-out visitor opens profile settings and the profile request returns 404', () => {
  render(<ProfileSettingsPage />);
  expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/login');
  expect(screen.queryByText('Failed to load profile')).toBeNull();
});

it('shows account actions without fabricated impact or live trip controls',async()=>{
  session.signedIn=true;
  render(<ProfileSettingsPage/>);
  expect(await screen.findByRole('heading',{name:'Mira'})).not.toBeNull();
  expect(screen.getByRole('link',{name:/historical corridor records/i})).not.toBeNull();
  expect(screen.queryByText(/profile completion/i)).toBeNull();
  expect(screen.queryByRole('button',{name:'Impact'})).toBeNull();
  expect(screen.queryByText(/Enable location tracking during active rides/i)).toBeNull();
});

it('uses the account page title as its only primary heading',async()=>{
  session.signedIn=true;
  render(<ProfileSettingsPage/>);
  expect(await screen.findByRole('heading',{name:'Mira'})).not.toBeNull();
  expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
  expect(screen.getByRole('heading',{level:1}).textContent).toBe('Account and declarations');
});

it('shows a profile placeholder when no photo is recorded',async()=>{
  session.signedIn=true;
  render(<ProfileSettingsPage/>);
  expect(await screen.findByRole('img',{name:"Mira's profile placeholder"})).not.toBeNull();
  expect(screen.queryByRole('img',{name:"Mira's profile"})).toBeNull();
});

it('keeps collapsed account controls out of keyboard navigation',async()=>{
  session.signedIn=true;
  render(<ProfileSettingsPage/>);
  const toggle=await screen.findByRole('button',{name:/^Preferences/});
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button',{name:'Save Preferences'})).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('button',{name:'Save Preferences'})).not.toBeNull();
});

it('opens the chosen account section from the section navigation',async()=>{
  session.signedIn=true;
  render(<ProfileSettingsPage/>);
  fireEvent.click(await screen.findByRole('link',{name:'Comfort'}));
  expect(screen.getByRole('button',{name:'Save Preferences'})).not.toBeNull();
});
