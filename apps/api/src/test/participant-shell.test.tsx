// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePathname} from 'next/navigation';
import ParticipantShell from '../../../../components/ParticipantShell';
vi.mock('next/navigation',()=>({usePathname:vi.fn(()=>'/dashboard'),useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:'person'},loading:false,logout:vi.fn()})}));
afterEach(()=>{cleanup();vi.mocked(usePathname).mockReturnValue('/dashboard');});
it('keeps historical ride records reachable from the participant menu',()=>{
  render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  expect(screen.getByRole('link',{name:/Historical ride offers/}).getAttribute('href')).toBe('/search-rides');
  expect(screen.getByRole('link',{name:/Historical ride posting/}).getAttribute('href')).toBe('/post-a-ride');
});

it('labels launch-gated destinations in the phone navigation',()=>{
  render(<ParticipantShell/>);
  const navigation=within(screen.getByRole('navigation',{name:'Participant quick navigation'}));
  expect(navigation.getByRole('link',{name:/Find a ride.*Later/i})).not.toBeNull();
  expect(navigation.getByRole('link',{name:/Offer a ride.*Later/i})).not.toBeNull();
  expect(navigation.getByRole('link',{name:/Trips.*Later/i})).not.toBeNull();
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
  expect(screen.getByRole('navigation',{name:'Participant menu'})).not.toBeNull();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('navigation',{name:'Participant menu'})).toBeNull();
});

it('closes the account menu when the current page changes',()=>{
  const view=render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  expect(screen.getByRole('navigation',{name:'Participant menu'})).not.toBeNull();
  vi.mocked(usePathname).mockReturnValue('/notifications');
  view.rerender(<ParticipantShell/>);
  expect(screen.queryByRole('navigation',{name:'Participant menu'})).toBeNull();
});
