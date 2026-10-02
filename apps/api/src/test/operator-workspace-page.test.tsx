// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import OperatorPage from '../../../../app/operator/page';

const {state,HttpError}=vi.hoisted(()=>{
  class HttpError extends Error {status:number;constructor(status:number){super(`HTTP ${status}`);this.status=status;}}
  return {state:{loading:false,user:{id:'operator'} as {id:string}|null,forbidden:false,failDelivery:false,failCancellation:false,holdCancellation:false,resolveCancellation:null as (()=>void)|null,failEndpoint:'',studentReviewPending:false,studentReviewError:false,studentByKeyState:'pending_unknown',revocationError:false,casePending:false,caseError:false,operationState:'pending_unknown',showPause:false,pauseError:false,pausePosts:[] as {key:string;body:string}[],reconciled:false,reopenError:false,reopenPosts:[] as {key:string;body:string}[]},HttpError};
});
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:state.user,loading:state.loading})}));
vi.mock('@/lib/api/client',()=>({ApiError:HttpError,apiRequest:async(path:string,options?:{headers?:Record<string,string>;body?:string})=>{
  if(path==='/v1/operator/pause'){
    state.pausePosts.push({key:options?.headers?.['Idempotency-Key']??'',body:options?.body??''});
    if(state.pauseError)throw new HttpError(503);
    return {id:'pause-decision-1',state:'committed'};
  }
  if(path==='/v1/operator/reopen'){
    state.reopenPosts.push({key:options?.headers?.['Idempotency-Key']??'',body:options?.body??''});
    if(state.reopenError)throw new HttpError(503);
    return {operationId:'reopen-decision-1'};
  }
  if(path.startsWith('/v1/operator/operations/by-key/'))return {id:'pause-decision-1',state:state.operationState};
  if(path==='/v1/operator/operations/pause-decision-1')return {id:'pause-decision-1',state:state.operationState};
  if(path==='/v1/verification/admin/student/student-1/review'){
    if(state.studentReviewError)throw new HttpError(503);
    return {operation:{id:'student-decision-1',state:'pending_unknown'}};
  }
  if(path.startsWith('/v1/verification/admin/student/review-operations/by-key/'))return {operation:{id:'student-decision-1',state:state.studentByKeyState}};
  if(path==='/v1/verification/admin/student/review-operations/student-decision-1')return {operation:{id:'student-decision-1',state:state.operationState}};
  if(path==='/v1/operator/students/student-1/revoke'){
    if(state.revocationError)throw Object.assign(new HttpError(503),{details:{operationId:'revocation-1'}});
    return {operation:{operation_id:'revocation-1',state:'pending_unknown'}};
  }
  if(path==='/v1/operator/students/revocations/revocation-1')return {operation:{operation_id:'revocation-1',state:state.operationState}};
  if(path==='/v1/operator/revocation-cases/hold/hold-1/outreach'){
    if(state.caseError)throw Object.assign(new HttpError(503),{details:{operationId:'case-action-1'}});
    return {operation:{operation_id:'case-action-1',state:'pending_unknown'}};
  }
  if(path==='/v1/operator/revocation-cases/operations/case-action-1')return {operation:{operation_id:'case-action-1',state:state.operationState}};
  if(path===state.failEndpoint)throw new HttpError(503);
  if(path==='/v1/operator/pending'){
    if(state.forbidden)throw new HttpError(403);
    return {operations:[{id:'operation-1',capability:'booking',paused:true,
      reason:'Recovery evidence pending',state:'committed'}]};
  }
  if(path==='/v1/operator/status')return {recovery:{mode:'restricted',cause:'receipt unavailable',
    started_at:'2026-10-02T09:00:00.000Z',reconciled_at:state.reconciled?'2026-10-02T10:00:00.000Z':null},
    backup:{required:true,healthy:false,maximumAgeMinutes:50,ageMinutes:null,latest:null,
    failedAttempts:[],runningAttempts:[]},capabilities:state.showPause?[{capability:'offers',paused:false,pending:false}]:[]};
  if(path==='/v1/operator/notifications/delivery'){
    if(state.failDelivery)throw new HttpError(503);
    return {jobs:[],health:{exhausted:1}};
  }
  if(path==='/v1/operator/urgent-outreach')return {records:[]};
  if(path==='/v1/operator/cancellation-reviews'){
    if(state.holdCancellation)await new Promise<void>(resolve=>{state.resolveCancellation=resolve;});
    if(state.failCancellation)throw new HttpError(503);
    return {cases:[]};
  }
  if(path==='/v1/operator/departure-reviews')return {signals:[]};
  if(path==='/v1/operator/revocation-cases')return {holds:state.casePending?[{id:'hold-1',offer_id:'ride-1',allocation_id:'seat-1',subject_type:'student',subject_id:'student-1',reason:'Eligibility revoked',created_at:'2026-10-02T09:00:00Z',resolved_at:null,resolution:null,driver_id:'driver-1',passenger_ids:['student-1'],offer_status:'confirmed',allocation_status:'held'}]:[],incidents:[]};
  if(path==='/v1/verification/admin/pending')return {student_verifications:state.studentReviewPending?[{user_id:'student-1',enrolled_name:'Alex',institution_name:'College',graduation_year:2027,evidence_category:'ID',age_evidence_category:'ID'}]:[]};
  if(path==='/v1/verification/evidence-capability')return {mode:'closed'};
  if(path==='/v1/verification/admin/student-evidence-retention')return {overdue_count:0,failed_count:0,oldest_due_at:null};
  if(path==='/v1/operator/journey-reviews')return {cases:[]};
  throw new Error(`Unexpected request: ${path}`);
}}));

afterEach(()=>{state.resolveCancellation?.();cleanup();sessionStorage.clear();state.loading=false;state.user={id:'operator'};state.forbidden=false;state.failDelivery=false;state.failCancellation=false;state.holdCancellation=false;state.resolveCancellation=null;state.failEndpoint='';state.studentReviewPending=false;state.studentReviewError=false;state.studentByKeyState='pending_unknown';state.revocationError=false;state.casePending=false;state.caseError=false;state.operationState='pending_unknown';state.showPause=false;state.pauseError=false;state.pausePosts=[];state.reconciled=false;state.reopenError=false;state.reopenPosts=[];});

it('retries an uncertain pause with the same key and payload',async()=>{
  state.showPause=true;state.pauseError=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Coverage is unavailable'}});
  fireEvent.click(screen.getByRole('button',{name:'Pause'}));
  expect(await screen.findByRole('button',{name:'Retry same pause decision'})).not.toBeNull();
  expect(screen.getByRole('button',{name:'Pause'}).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Decision reason'),{target:{value:'A different reason now'}});
  fireEvent.click(screen.getByRole('button',{name:'Retry same pause decision'}));
  expect(await screen.findByText(/Pause outcome uncertain or rejected/)).not.toBeNull();
  expect(state.pausePosts).toHaveLength(2);
  expect(state.pausePosts[1]).toEqual(state.pausePosts[0]);
  cleanup();render(<OperatorPage/>);
  expect(await screen.findByRole('button',{name:'Retry same pause decision'})).not.toBeNull();
});
it('retries an uncertain reopen with the same key and reason after reload',async()=>{
  state.reconciled=true;state.reopenError=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Recovery evidence reviewed'}});
  fireEvent.click(screen.getByRole('button',{name:'Manually reopen'}));
  expect(await screen.findByRole('button',{name:'Retry same reopen decision'})).not.toBeNull();
  cleanup();render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'A different reason now'}});
  fireEvent.click(await screen.findByRole('button',{name:'Retry same reopen decision'}));
  expect(await screen.findByText(/Reopen outcome uncertain or rejected/)).not.toBeNull();
  expect(state.reopenPosts).toHaveLength(2);
  expect(state.reopenPosts[1]).toEqual(state.reopenPosts[0]);
});

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

it('shows cancellation review as unavailable when its first read fails',async()=>{
  state.failCancellation=true;
  render(<OperatorPage/>);
  expect(await screen.findByText(/Could not refresh: Cancellation reviews/)).not.toBeNull();
  expect(screen.getByText(/Cancellation reviews unavailable/)).not.toBeNull();
  expect(screen.queryByText(/No open cancellation review cases/)).toBeNull();
  expect(screen.getByRole('link',{name:/ROUTES.*unavailable/i})).not.toBeNull();
});
it('shows queues as loading while the first protected reads are pending',async()=>{
  state.holdCancellation=true;
  render(<OperatorPage/>);
  expect(await screen.findByRole('heading',{name:'Operator workspace'})).not.toBeNull();
  expect(screen.getByText('Loading cancellation reviews…')).not.toBeNull();
  expect(screen.queryByText('No open cancellation review cases.')).toBeNull();
  state.resolveCancellation?.();
});

it.each([
  ['/v1/operator/departure-reviews','Departure reviews','No departure signals require review'],
  ['/v1/operator/revocation-cases','Revocation cases','No revocation holds recorded'],
  ['/v1/verification/admin/pending','Historical student reviews','No pending student reviews'],
])('does not claim %s is empty when unavailable',async(endpoint,label,emptyText)=>{
  state.failEndpoint=endpoint;
  render(<OperatorPage/>);
  expect(await screen.findByText(new RegExp(`Could not refresh: ${label}`))).not.toBeNull();
  expect(screen.getByText(new RegExp(`${label} unavailable`))).not.toBeNull();
  expect(screen.queryByText(emptyText)).toBeNull();
});

it('lets an operator check a pending student review before making another decision',async()=>{
  state.studentReviewPending=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Evidence is incomplete'}});
  fireEvent.click(screen.getByRole('button',{name:'Reject'}));
  expect(await screen.findByText(/Student review student-decision-1 is pending_unknown/)).not.toBeNull();
  cleanup();render(<OperatorPage/>);
  expect(await screen.findByRole('button',{name:'Check student review status'})).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Check student review status'}));
  expect(await screen.findByText(/Student review student-decision-1 is still pending_unknown/)).not.toBeNull();
  state.operationState='recovered';
  fireEvent.click(screen.getByRole('button',{name:'Check student review status'}));
  expect(await screen.findByText(/Student review student-decision-1: recovered/)).not.toBeNull();
});

it('offers status lookup after a student review response is lost',async()=>{
  state.studentReviewPending=true;state.studentReviewError=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Evidence is incomplete'}});
  fireEvent.click(screen.getByRole('button',{name:'Reject'}));
  expect(await screen.findByText(/Review outcome uncertain/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Check student review status'})).not.toBeNull();
});
it('confirms a student review found by key after its response was lost',async()=>{
  state.studentReviewPending=true;state.studentReviewError=true;state.studentByKeyState='recovered';
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Evidence is incomplete'}});
  fireEvent.click(screen.getByRole('button',{name:'Reject'}));
  expect(await screen.findByText(/Student review student-decision-1: recovered/)).not.toBeNull();
  expect(screen.queryByText(/Review outcome uncertain/)).toBeNull();
});

it('lets an operator check a pending student revocation',async()=>{
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Enrollment revoked'}});
  fireEvent.change(screen.getByLabelText('Student ID'),{target:{value:'student-1'}});
  fireEvent.click(screen.getByRole('button',{name:'Suspend student eligibility'}));
  expect(await screen.findByText(/Student revocation revocation-1 is pending_unknown/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Check student revocation status'}));
  expect(await screen.findByText(/Student revocation revocation-1 is still pending_unknown/)).not.toBeNull();
});

it('offers revocation status lookup when the server returns an operation ID with an error',async()=>{
  state.revocationError=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Enrollment revoked'}});
  fireEvent.change(screen.getByLabelText('Student ID'),{target:{value:'student-1'}});
  fireEvent.click(screen.getByRole('button',{name:'Suspend student eligibility'}));
  expect(await screen.findByText(/Revocation outcome uncertain/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Check student revocation status'})).not.toBeNull();
});

it('lets an operator check a pending revocation case action',async()=>{
  state.casePending=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Outreach required now'}});
  fireEvent.click(screen.getByRole('button',{name:'Record participant outreach'}));
  expect(await screen.findByText(/Case action case-action-1 is pending_unknown/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Check case action status'}));
  expect(await screen.findByText(/Case action case-action-1 is still pending_unknown/)).not.toBeNull();
});

it('offers case action status lookup when recovery evidence is pending',async()=>{
  state.casePending=true;state.caseError=true;
  render(<OperatorPage/>);
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Outreach required now'}});
  fireEvent.click(screen.getByRole('button',{name:'Record participant outreach'}));
  expect(await screen.findByText(/Case action outcome uncertain/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Check case action status'})).not.toBeNull();
});

it('shows sign-in and access-check states before protected reads',()=>{
  state.loading=true;
  const view=render(<OperatorPage/>);
  expect(screen.getByText(/Checking operator access/)).not.toBeNull();
  state.loading=false;state.user=null;
  view.rerender(<OperatorPage/>);
  expect(screen.getByText(/Sign in to access/)).not.toBeNull();
});
