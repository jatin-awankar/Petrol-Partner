// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import AccountReadiness from '../../../../components/profile/AccountReadiness';

const apiRequest=vi.fn();
vi.mock('@/lib/api/client',()=>({apiRequest:(...args:unknown[])=>apiRequest(...args)}));
afterEach(()=>{cleanup();apiRequest.mockReset();});

it('shows the next declaration step from current account state',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path==='/v1/adult-declaration'
    ? {declaration:{state:'current',restriction_source:null}}
    : {driver:{state:'expired',restricted:false},vehicles:[{state:'expired',category:'car'}]});
  render(<AccountReadiness/>);
  expect(await screen.findByText('Adult declaration: current')).not.toBeNull();
  expect(screen.getByText('Driver declaration: expired')).not.toBeNull();
  expect(screen.getByRole('link',{name:/renew driver declaration/i}).getAttribute('href')).toBe('/driver-vehicle-declarations');
  expect(screen.getByText(/Real bookings remain closed/i)).not.toBeNull();
});

it('does not describe a revoked driver declaration as ready',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path==='/v1/adult-declaration'
    ? {declaration:{state:'current',restriction_source:null}}
    : {driver:{state:'revoked',restricted:false},vehicles:[]});
  render(<AccountReadiness/>);
  expect(await screen.findByText('Driver declaration: revoked')).not.toBeNull();
  expect(screen.getByText(/needs account review before driver actions/i)).not.toBeNull();
  expect(screen.queryByText(/Your declarations are recorded/i)).toBeNull();
});

it('shows driver preparation as optional for an adult passenger',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path==='/v1/adult-declaration'
    ? {declaration:{state:'current',restriction_source:null}}
    : {driver:{state:'missing',restricted:false},vehicles:[]});
  render(<AccountReadiness/>);
  expect(await screen.findByText('Adult declaration: current')).not.toBeNull();
  expect(screen.getByText(/No driver declaration is needed to request a seat/i)).not.toBeNull();
  expect(screen.getByRole('link',{name:/optional.*driver declaration/i})).not.toBeNull();
});

it('does not block a separate current vehicle because another record was revoked',async()=>{
  apiRequest.mockImplementation(async(path:string)=>path==='/v1/adult-declaration'
    ? {declaration:{state:'current',restriction_source:null}}
    : {driver:{state:'current',restricted:false},vehicles:[
      {state:'revoked',category:'car'},{state:'current',category:'bike'}]});
  render(<AccountReadiness/>);
  expect(await screen.findByText(/Vehicle declarations: car revoked, bike current/i)).not.toBeNull();
  expect(screen.getByText(/The revoked car declaration cannot be used/i)).not.toBeNull();
  expect(screen.queryByText(/needs account review before driver actions/i)).toBeNull();
});
