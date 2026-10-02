// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePathname} from 'next/navigation';
import ParticipantShell from '../../../../components/ParticipantShell';
vi.mock('next/navigation',()=>({usePathname:vi.fn(()=>'/dashboard'),useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:'person'},loading:false,logout:vi.fn()})}));
afterEach(()=>{cleanup();vi.mocked(usePathname).mockReturnValue('/dashboard');});
it('keeps historical records reachable without linking to legacy ride actions',()=>{
  render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  const menu=within(screen.getByRole('navigation',{name:'Participant menu'}));
  expect(menu.getByRole('link',{name:/Historical pilot eligibility/}).getAttribute('href')).toBe('/eligibility');
  expect(menu.getByRole('link',{name:/Contribution records/}).getAttribute('href')).toBe('/direct-settlements');
  expect(menu.queryAllByRole('link',{name:/Historical ride offers|Historical ride posting/})).toHaveLength(0);
});

it('labels launch-gated destinations in the phone navigation',()=>{
  render(<ParticipantShell/>);
  const navigation=within(screen.getByRole('navigation',{name:'Participant quick navigation'}));
  expect(navigation.getByRole('link',{name:/Find a ride.*Later/i})).not.toBeNull();
  expect(navigation.getByRole('link',{name:/Offer a ride.*Later/i})).not.toBeNull();
  expect(navigation.getByRole('link',{name:'Trips'}).getAttribute('href')).toBe('/trips');
});

it('closes the account menu when a phone navigation destination is chosen',()=>{
  render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  expect(screen.getByRole('navigation',{name:'Participant menu'})).not.toBeNull();
  const navigation=within(screen.getByRole('navigation',{name:'Participant quick navigation'}));
  const destination=navigation.getByRole('link',{name:/Find a ride.*Later/i});
  destination.addEventListener('click',event=>event.preventDefault());
  fireEvent.click(destination);
  expect(screen.queryByRole('navigation',{name:'Participant menu'})).toBeNull();
});

it('closes the account menu with Escape',()=>{
  render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  const menu=within(screen.getByRole('navigation',{name:'Participant menu'}));
  menu.getByRole('link',{name:'Account settings'}).focus();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('navigation',{name:'Participant menu'})).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Open menu'}));
});

it('closes the account menu when the current page changes',()=>{
  const view=render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  expect(screen.getByRole('navigation',{name:'Participant menu'})).not.toBeNull();
  vi.mocked(usePathname).mockReturnValue('/notifications');
  view.rerender(<ParticipantShell/>);
  expect(screen.queryByRole('navigation',{name:'Participant menu'})).toBeNull();
});
