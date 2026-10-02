// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import OperatorPage from '../../../../app/operator/restrictions/page';
import EligibilityPage from '../../../../app/eligibility/page';

const target='11111111-1111-4111-8111-111111111111';
const state=vi.hoisted(()=>({failHistory:false,targetInUrl:true,restrictionPending:false,operationState:'pending_unknown',posts:[] as {key:string;body:string}[]}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(state.targetInUrl?`target=${target}`:'')}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:target},loading:false})}));
vi.mock('@/lib/api/client',()=>({ApiError:class ApiError extends Error{},
  apiRequest:async(path:string,options?:{method?:string;headers?:Record<string,string>;body?:string})=>{
    if(path==='/v1/operator/status') return {recovery:{mode:'normal'}};
    if(path==='/v1/operator/account-restrictions'&&options?.method==='POST'){
      state.posts.push({key:options.headers?.['Idempotency-Key']??'',body:options.body??''});
      return {operation:{operation_id:'restriction-operation-1',state:state.restrictionPending?'pending_unknown':'acknowledged'}};
    }
    if(path==='/v1/operator/account-restriction-operations/restriction-operation-1')
      return {operation:{operation_id:'restriction-operation-1',state:state.operationState}};
    if(path.includes('/operator/account-restrictions/')){
      if(state.failHistory)throw new Error('History unavailable');
      return {history:[{
      id:'22222222-2222-4222-8222-222222222222',operator_id:'operator',
      target_user_id:target,action:'restrict',scope:'passenger',source_type:'incident',
      source_id:'33333333-3333-4333-8333-333333333333',reason:'Reviewed safety concern',
      reviewed_evidence:'Reviewed private incident evidence',reverses_id:null,
      committed_at:'2026-09-27T10:00:00.000Z'}]};
    }
    if(path==='/v1/verification/account-restrictions') return {history:[{
      id:'22222222-2222-4222-8222-222222222222',action:'restrict',scope:'passenger',
      reason:'Reviewed safety concern',recorded_at:'2026-09-27T10:00:00.000Z',reverses_id:null}]};
    if(path==='/v1/verification/student') return {student_verification:null};
    if(path==='/v1/verification/evidence-capability') return {mode:'closed'};
    throw new Error(`Unexpected request: ${path}`);
  }}));
afterEach(()=>{cleanup();sessionStorage.clear();state.failHistory=false;state.targetInUrl=true;state.restrictionPending=false;state.operationState='pending_unknown';state.posts=[];});

it('keeps an uncertain restriction available for status lookup and blocks another decision',async()=>{
  state.restrictionPending=true;
  render(<OperatorPage/>);
  await screen.findByText(/Active restriction · passenger/);
  fireEvent.change(screen.getByLabelText('Incident ID'),{target:{value:'33333333-3333-4333-8333-333333333333'}});
  fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Reviewed safety concern'}});
  fireEvent.change(screen.getByLabelText('Reviewed evidence summary'),{target:{value:'Reviewed private incident evidence'}});
  fireEvent.click(screen.getByRole('button',{name:'Record restriction'}));
  expect(await screen.findByRole('button',{name:'Check restriction decision status'})).not.toBeNull();
  expect(screen.getByRole('button',{name:'Record restriction'}).hasAttribute('disabled')).toBe(true);
  expect(state.posts).toHaveLength(1);
  cleanup();render(<OperatorPage/>);
  expect(await screen.findByRole('button',{name:'Check restriction decision status'})).not.toBeNull();
  state.operationState='acknowledged';
  fireEvent.click(screen.getByRole('button',{name:'Check restriction decision status'}));
  expect(await screen.findByText(/restriction-operation-1: acknowledged/)).not.toBeNull();
});

it('shows operator restriction history with reviewed evidence and a reversal action',async()=>{
  render(<OperatorPage/>);
  expect(await screen.findByText(/Active restriction · passenger/)).not.toBeNull();
  expect(screen.getByText(/Reviewed private incident evidence/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Reverse after review'})).not.toBeNull();
});
it('shows the participant restriction without private reviewed evidence',async()=>{
  render(<EligibilityPage/>);
  expect(await screen.findByText(/Active restriction · passenger/)).not.toBeNull();
  expect(screen.queryByText(/Reviewed private incident evidence/)).toBeNull();
});
it('does not call restriction history empty when its read fails',async()=>{
  state.failHistory=true;
  render(<OperatorPage/>);
  expect(await screen.findByText('Restriction history unavailable. Retry history.')).not.toBeNull();
  expect(screen.queryByText('No restrictions recorded for this participant.')).toBeNull();
});
it('asks for a participant before claiming restriction history is empty',async()=>{
  state.targetInUrl=false;
  render(<OperatorPage/>);
  expect(await screen.findByText('Enter a participant ID to view restriction history.')).not.toBeNull();
});
