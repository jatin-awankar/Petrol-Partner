// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import DriverVehicleDeclarationsPage from '../../../../app/driver-vehicle-declarations/page';

const apiRequest=vi.fn();
const currentUser={id:'person'};
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:currentUser,loading:false})}));
vi.mock('@/lib/api/client',()=>({apiRequest:(...args:unknown[])=>apiRequest(...args)}));
afterEach(()=>{cleanup();apiRequest.mockReset();sessionStorage.clear();});

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

it('lets a driver correct a rejected declaration and submit the changed details',async()=>{
  const submissions:{body:string;key:string}[]=[];
  apiRequest.mockImplementation(async(path:string,options?:{body?:string;headers?:Record<string,string>})=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'missing'},vehicles:[]};
    if(path==='/v1/driver-vehicle-declarations/driver'){
      submissions.push({body:options?.body??'',key:options?.headers?.['Idempotency-Key']??''});
      if(submissions.length===1)throw Object.assign(new Error('Expiry must be in the future'),{status:400,code:'DECLARATION_EXPIRED'});
    }
    return {};
  });
  render(<DriverVehicleDeclarationsPage/>);
  await screen.findByText('Driver: missing');
  fireEvent.click(screen.getByLabelText('car'));
  fireEvent.change(screen.getByLabelText('Licence expiry date'),{target:{value:'2025-12-31'}});
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await screen.findByText(/Expiry must be in the future/);
  fireEvent.change(screen.getByLabelText('Licence expiry date'),{target:{value:'2030-12-31'}});
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await waitFor(()=>expect(submissions).toHaveLength(2));
  expect(JSON.parse(submissions[1].body).licence_expires_on).toBe('2030-12-31');
  expect(submissions[1].key).not.toBe(submissions[0].key);
});

it('confirms a driver revocation as a revocation',async()=>{
  apiRequest.mockImplementation(async(path:string)=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'current'},vehicles:[]};
    return {};
  });
  render(<DriverVehicleDeclarationsPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Revoke my driver declaration'}));
  expect(await screen.findByText(/Driver declaration revoked/i)).not.toBeNull();
});

it('checks an uncertain declaration before sending it again',async()=>{
  let writes=0;
  apiRequest.mockImplementation(async(path:string)=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'missing'},vehicles:[]};
    if(path.startsWith('/v1/driver-vehicle-declarations/operations/'))return {operation:{operation_id:'op',state:'acknowledged',action:'driver_declare'}};
    if(path==='/v1/driver-vehicle-declarations/driver'){
      writes++;
      throw new Error('Connection lost');
    }
    return {};
  });
  render(<DriverVehicleDeclarationsPage/>);
  await screen.findByText('Driver: missing');
  fireEvent.click(screen.getByLabelText('car'));
  fireEvent.change(screen.getByLabelText('Licence expiry date'),{target:{value:'2030-12-31'}});
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await screen.findByText(/Connection lost/);
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  expect(await screen.findByText(/Earlier declaration was recorded/i)).not.toBeNull();
  expect(writes).toBe(1);
});

it('can check a saved revocation result after the page reloads',async()=>{
  sessionStorage.setItem('pp-declaration-pending:driver-vehicle:person',JSON.stringify({
    action:'driver-revoke',key:'earlier-key',path:'/v1/driver-vehicle-declarations/driver/revoke',method:'POST',body:'{}'}));
  apiRequest.mockImplementation(async(path:string)=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'revoked'},vehicles:[]};
    if(path==='/v1/driver-vehicle-declarations/operations/earlier-key')return {operation:{operation_id:'op',state:'acknowledged',action:'driver_revoke'}};
    throw new Error('Unexpected write');
  });
  render(<DriverVehicleDeclarationsPage/>);
  expect(await screen.findByRole('button',{name:/check earlier result/i})).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/check earlier result/i}));
  expect(await screen.findByText(/Earlier declaration was recorded/i)).not.toBeNull();
  expect(sessionStorage.getItem('pp-declaration-pending:driver-vehicle:person')).toBeNull();
});

it('keeps an uncertain operation when its lookup cannot be completed',async()=>{
  let writes=0;
  apiRequest.mockImplementation(async(path:string)=>{
    if(path==='/v1/adult-declaration')return {declaration:{state:'current',current_policy_version:'route-v1'}};
    if(path==='/v1/driver-vehicle-declarations')return {driver:{state:'missing'},vehicles:[]};
    if(path.startsWith('/v1/driver-vehicle-declarations/operations/'))throw Object.assign(new Error('Sign in again'),{status:403,code:'FORBIDDEN'});
    if(path==='/v1/driver-vehicle-declarations/driver'){writes++;throw new Error('Connection lost');}
    return {};
  });
  render(<DriverVehicleDeclarationsPage/>);
  await screen.findByText('Driver: missing');
  fireEvent.click(screen.getByLabelText('car'));
  fireEvent.change(screen.getByLabelText('Licence expiry date'),{target:{value:'2030-12-31'}});
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await screen.findByText(/Connection lost/);
  fireEvent.click(screen.getByRole('button',{name:'Record driver declaration'}));
  await screen.findByText(/Sign in again/);
  expect(writes).toBe(1);
  expect(sessionStorage.getItem('pp-declaration-pending:driver-vehicle:person')).not.toBeNull();
});
