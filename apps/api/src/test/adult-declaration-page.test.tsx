// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import AdultDeclarationPage from '../../../../app/adult-declaration/page';

const apiRequest=vi.fn();
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:'person'},loading:false})}));
vi.mock('@/lib/api/client',()=>({apiRequest:(...args:unknown[])=>apiRequest(...args)}));
afterEach(()=>{cleanup();apiRequest.mockReset();sessionStorage.clear();});

it('uses a fresh key and policy terms after a known stale-policy rejection',async()=>{
  let version='route-v1';const submissions:{key:string;body:string}[]=[];
  apiRequest.mockImplementation(async(path:string,options?:{headers?:Record<string,string>;body?:string})=>{
    if(path==='/v1/adult-declaration'&&!options)return {declaration:{state:'current',kind:'self_declaration',current_policy_version:version,declared_at:null,withdrawn_at:null}};
    if(path==='/v1/adult-declaration'&&options){
      submissions.push({key:options.headers?.['Idempotency-Key']??'',body:options.body??''});
      if(submissions.length===1){version='route-v2';throw Object.assign(new Error('Current declaration policy is required'),{status:409,code:'POLICY_VERSION_STALE'});}
    }
    return {};
  });
  render(<AdultDeclarationPage/>);
  await screen.findByText('Policy: route-v1');
  fireEvent.click(screen.getByLabelText(/I declare that I am at least 18/i));
  fireEvent.click(screen.getByRole('button',{name:'Reconfirm declaration'}));
  await screen.findByText(/Current declaration policy is required/);
  await screen.findByText('Policy: route-v2');
  fireEvent.click(screen.getByRole('button',{name:'Reconfirm declaration'}));
  await waitFor(()=>expect(submissions).toHaveLength(2));
  expect(submissions[1].key).not.toBe(submissions[0].key);
  expect(JSON.parse(submissions[1].body).policy_version).toBe('route-v2');
});

it('checks a saved withdrawal result after the page reloads',async()=>{
  sessionStorage.setItem('pp-declaration-pending:adult:person',JSON.stringify({
    action:'withdraw',key:'earlier-key',body:JSON.stringify({policy_version:'route-v1'})}));
  apiRequest.mockImplementation(async(path:string,options?:object)=>{
    if(path==='/v1/adult-declaration'&&!options)return {declaration:{state:'withdrawn',kind:'self_declaration',current_policy_version:'route-v1',declared_at:'2026-09-01',withdrawn_at:'2026-09-02'}};
    if(path==='/v1/adult-declaration/operations/earlier-key')return {operation:{operation_id:'op',state:'acknowledged',action:'withdraw'}};
    throw new Error('Unexpected write');
  });
  render(<AdultDeclarationPage/>);
  fireEvent.click(await screen.findByRole('button',{name:/check earlier result/i}));
  expect(await screen.findByText(/Earlier declaration was recorded/i)).not.toBeNull();
  expect(sessionStorage.getItem('pp-declaration-pending:adult:person')).toBeNull();
});

it('keeps a pending adult declaration when its lookup is unavailable',async()=>{
  let writes=0;
  apiRequest.mockImplementation(async(path:string,options?:object)=>{
    if(path==='/v1/adult-declaration'&&!options)return {declaration:{state:'missing',kind:'self_declaration',current_policy_version:'route-v1',declared_at:null,withdrawn_at:null}};
    if(path.startsWith('/v1/adult-declaration/operations/'))throw Object.assign(new Error('Sign in again'),{status:403,code:'FORBIDDEN'});
    if(path==='/v1/adult-declaration'&&options){writes++;throw new Error('Connection lost');}
    return {};
  });
  render(<AdultDeclarationPage/>);
  await screen.findByText('Policy: route-v1');
  fireEvent.click(screen.getByLabelText(/I declare that I am at least 18/i));
  fireEvent.click(screen.getByRole('button',{name:'Record declaration'}));
  await screen.findByText(/Connection lost/);
  fireEvent.click(screen.getByRole('button',{name:'Record declaration'}));
  await screen.findByText(/Sign in again/);
  expect(writes).toBe(1);
  expect(sessionStorage.getItem('pp-declaration-pending:adult:person')).not.toBeNull();
});
