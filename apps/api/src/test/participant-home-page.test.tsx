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

it('directs a current adult with no driver declaration to the driver declaration journey',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path.includes('driver-vehicle')?{driver:{state:'missing',restricted:false},vehicles:[]}:{declaration:{state:'current',kind:'self_declaration',restriction_source:null}});
  render(await DashboardPage());
  expect(await screen.findByRole('link',{name:/record driver declaration/i})).not.toBeNull();
});
