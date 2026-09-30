// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import ParticipantShell from '../../../../components/ParticipantShell';
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard',useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:'person'},loading:false,logout:vi.fn()})}));
afterEach(()=>cleanup());
it('keeps historical ride records reachable from the participant menu',()=>{
  render(<ParticipantShell/>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  expect(screen.getByRole('link',{name:/Historical ride offers/}).getAttribute('href')).toBe('/search-rides');
  expect(screen.getByRole('link',{name:/Historical ride posting/}).getAttribute('href')).toBe('/post-a-ride');
});
