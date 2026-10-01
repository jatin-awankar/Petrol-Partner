// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import EligibilityPage from '../../../../app/eligibility/page';

const apiRequest=vi.fn();
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:'person'},loading:false})}));
vi.mock('@/lib/api/client',()=>({apiRequest:(...args:unknown[])=>apiRequest(...args)}));
afterEach(()=>{cleanup();apiRequest.mockReset();});

it('shows historical corridor evidence as a record without inviting a new submission',async()=>{
  apiRequest.mockImplementation(async(path:string)=>{
    if(path==='/v1/verification/student')return {student_verification:null};
    if(path==='/v1/verification/account-restrictions')return {history:[]};
    if(path==='/v1/verification/evidence-capability')return {mode:'synthetic'};
    return {};
  });
  render(<EligibilityPage/>);
  expect(await screen.findByText(/Status: not submitted/i)).not.toBeNull();
  expect(screen.getByText(/This page preserves records from the former corridor pilot/i)).not.toBeNull();
  expect(screen.queryByRole('button',{name:/submit evidence/i})).toBeNull();
  expect(screen.queryByRole('textbox',{name:/institution/i})).toBeNull();
});
