// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import OperatorPage from '../../../../app/operator/restrictions/page';
import EligibilityPage from '../../../../app/eligibility/page';

const target='11111111-1111-4111-8111-111111111111';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(`target=${target}`)}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:target},loading:false})}));
vi.mock('@/lib/api/client',()=>({ApiError:class ApiError extends Error{},
  apiRequest:async(path:string)=>{
    if(path.includes('/operator/account-restrictions/')) return {history:[{
      id:'22222222-2222-4222-8222-222222222222',operator_id:'operator',
      target_user_id:target,action:'restrict',scope:'passenger',source_type:'incident',
      source_id:'33333333-3333-4333-8333-333333333333',reason:'Reviewed safety concern',
      reviewed_evidence:'Reviewed private incident evidence',reverses_id:null,
      committed_at:'2026-09-27T10:00:00.000Z'}]};
    if(path==='/v1/verification/account-restrictions') return {history:[{
      id:'22222222-2222-4222-8222-222222222222',action:'restrict',scope:'passenger',
      reason:'Reviewed safety concern',recorded_at:'2026-09-27T10:00:00.000Z',reverses_id:null}]};
    if(path==='/v1/verification/student') return {student_verification:null};
    if(path==='/v1/verification/evidence-capability') return {mode:'closed'};
    throw new Error(`Unexpected request: ${path}`);
  }}));
afterEach(()=>cleanup());

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
