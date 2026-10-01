// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import DashboardPage from '../../../../app/dashboard/page';

const apiRequest=vi.fn();
vi.mock('@/lib/server-auth',()=>({getServerCurrentUser:async()=>({id:'person'})}));
vi.mock('@/lib/api/client',()=>({apiRequest:(...args:unknown[])=>apiRequest(...args)}));
vi.mock('next/navigation',()=>({redirect:vi.fn()}));
afterEach(()=>{cleanup();apiRequest.mockReset();});

it('shows the current declaration as complete instead of asking the participant to declare again',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path.includes("driver-vehicle")?{driver:{state:"missing",restricted:false},vehicles:[]}:{declaration:{state:"current",kind:"self_declaration",restriction_source:null}});
  render(await DashboardPage());
  expect(await screen.findByText(/Adult declaration current/)).not.toBeNull();
  expect(screen.queryByRole('link',{name:/Review adult declaration/})).toBeNull();
});

it('explains an account restriction before offering a next action',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path.includes("driver-vehicle")?{driver:{state:"restricted",restricted:true},vehicles:[]}:{declaration:{state:"restricted",kind:"self_declaration",restriction_source:"account_status"}});
  render(await DashboardPage());
  expect(await screen.findByText(/account is inactive/i)).not.toBeNull();
});

it('offers driver setup as an optional next step for a current adult',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path.includes('driver-vehicle')?{driver:{state:'missing',restricted:false},vehicles:[]}:{declaration:{state:'current',kind:'self_declaration',restriction_source:null}});
  render(await DashboardPage());
  expect(await screen.findByRole('link',{name:/optional.*record driver declaration/i})).not.toBeNull();
  expect(screen.getByText(/Passengers do not need a driver declaration/i)).not.toBeNull();
});
