// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import OperatorPage from '../../../../app/operator/page';

const {state,HttpError}=vi.hoisted(()=>{
  class HttpError extends Error {status:number;constructor(status:number){super(`HTTP ${status}`);this.status=status;}}
  return {state:{loading:false,user:{id:'operator'} as {id:string}|null,forbidden:false,failDelivery:false},HttpError};
});
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:state.user,loading:state.loading})}));
vi.mock('@/lib/api/client',()=>({ApiError:HttpError,apiRequest:async(path:string)=>{
  if(path==='/v1/operator/pending'){
    if(state.forbidden)throw new HttpError(403);
    return {operations:[{id:'operation-1',capability:'booking',paused:true,
      reason:'Recovery evidence pending',state:'committed'}]};
  }
  if(path==='/v1/operator/status')return {recovery:{mode:'restricted',cause:'receipt unavailable',
    started_at:'2026-10-02T09:00:00.000Z',reconciled_at:null},
    backup:{required:true,healthy:false,maximumAgeMinutes:50,ageMinutes:null,latest:null,
      failedAttempts:[],runningAttempts:[]},capabilities:[]};
  if(path==='/v1/operator/notifications/delivery'){
    if(state.failDelivery)throw new HttpError(503);
    return {jobs:[],health:{exhausted:1}};
  }
  if(path==='/v1/operator/urgent-outreach')return {records:[]};
  if(path==='/v1/operator/cancellation-reviews')return {cases:[]};
  if(path==='/v1/operator/departure-reviews')return {signals:[]};
  if(path==='/v1/operator/revocation-cases')return {holds:[],incidents:[]};
  if(path==='/v1/verification/admin/pending')return {student_verifications:[]};
  if(path==='/v1/verification/evidence-capability')return {mode:'closed'};
  if(path==='/v1/verification/admin/student-evidence-retention')return {overdue_count:0,failed_count:0,oldest_due_at:null};
  if(path==='/v1/operator/journey-reviews')return {cases:[]};
  throw new Error(`Unexpected request: ${path}`);
}}));

afterEach(()=>{cleanup();state.loading=false;state.user={id:'operator'};state.forbidden=false;state.failDelivery=false;});

it('renders the protected queue map with restricted recovery and unknown operation state',async()=>{
  render(<OperatorPage/>);
  expect(await screen.findByText(/Recovery mode: restricted/)).not.toBeNull();
  expect(screen.getByRole('link',{name:/Eligibility.*student reviews/i})).not.toBeNull();
  expect(screen.getByText(/Historical corridor · route read gated/)).not.toBeNull();
  expect(screen.getByText(/pending durable confirmation/)).not.toBeNull();
  expect(screen.getByText(/no live route queue is available/i)).not.toBeNull();
});

it('does not render protected data after a forbidden HTTP response',async()=>{
  state.forbidden=true;
  render(<OperatorPage/>);
  expect(await screen.findByRole('alert')).not.toBeNull();
  expect(screen.queryByText(/Unknown and pending decisions/)).toBeNull();
});

it('shows a retryable partial read failure without claiming the delivery queue is empty',async()=>{
  state.failDelivery=true;
  render(<OperatorPage/>);
  expect(await screen.findByRole('alert')).not.toBeNull();
  expect(screen.getByText(/Could not refresh: Notification delivery/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Retry reads'})).not.toBeNull();
  expect(screen.queryByText(/No delivery jobs require operator attention/)).toBeNull();
});

it('shows sign-in and access-check states before protected reads',()=>{
  state.loading=true;
  const view=render(<OperatorPage/>);
  expect(screen.getByText(/Checking operator access/)).not.toBeNull();
  state.loading=false;state.user=null;
  view.rerender(<OperatorPage/>);
  expect(screen.getByText(/Sign in to access/)).not.toBeNull();
});
