// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import DriverVehicleDeclarationsPage from '../../../../app/driver-vehicle-declarations/page';

const apiRequest=vi.fn();
const currentUser={id:'person'};
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:currentUser,loading:false})}));
vi.mock('@/lib/api/client',()=>({apiRequest:(...args:unknown[])=>apiRequest(...args)}));
afterEach(()=>{cleanup();apiRequest.mockReset();});

it('lets a driver renew an expired vehicle declaration',async()=>{
  apiRequest.mockImplementation(async(path:string)=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'current'},vehicles:[{id:'11111111-1111-4111-8111-111111111111',state:'expired',category:'car',registration_identifier:'MH01AB1234',registration_expires_on:'2025-01-01',insurance_expires_on:'2025-01-01',passenger_capacity:2}]};
    return {};
  });
  render(<DriverVehicleDeclarationsPage/>);
  fireEvent.click(await screen.findByRole('button',{name:/renew this vehicle declaration/i}));
  fireEvent.change(screen.getByLabelText('Registration expiry date'),{target:{value:'2030-12-31'}});
  fireEvent.change(screen.getByLabelText('Insurance expiry date'),{target:{value:'2030-12-31'}});
  fireEvent.click(screen.getByLabelText(/I declare current registration/i));
  fireEvent.click(screen.getByRole('button',{name:/record vehicle declaration/i}));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('/v1/driver-vehicle-declarations/vehicles/11111111-1111-4111-8111-111111111111',expect.objectContaining({method:'PUT'})));
});

it('retries an uncertain declaration with its original terms',async()=>{
  const submissions:{body:string;key:string}[]=[];
  apiRequest.mockImplementation(async(path:string,options?:{method?:string;body?:string;headers?:Record<string,string>})=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'missing'},vehicles:[]};
    if(path==='/v1/driver-vehicle-declarations/driver'){
      submissions.push({body:options?.body??'',key:options?.headers?.['Idempotency-Key']??''});
      if(submissions.length===1)throw new Error('Connection lost');
    }
    return {};
  });
  render(<DriverVehicleDeclarationsPage/>);
  await screen.findByText('Driver: missing');
  fireEvent.click(screen.getByLabelText('car'));
  fireEvent.change(screen.getByLabelText('Licence expiry date'),{target:{value:'2030-12-31'}});
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await screen.findByText(/Connection lost/);
  fireEvent.change(screen.getByLabelText('Licence expiry date'),{target:{value:'2031-12-31'}});
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await waitFor(()=>expect(submissions).toHaveLength(2));
  expect(submissions[1]).toEqual(submissions[0]);
});
