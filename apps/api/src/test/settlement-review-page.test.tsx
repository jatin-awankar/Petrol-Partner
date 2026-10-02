// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import Page from '../../../../app/operator/settlement-reviews/page';
const state=vi.hoisted(()=>({failQueue:false,failSecondDetail:false,decisionPending:false,decisionError:false,operationState:'pending_unknown'}));
vi.mock('@/lib/api/client',()=>({ApiError:class ApiError extends Error{},
  apiRequest:async(path:string)=>{if(state.failQueue&&path==='/v1/operator/settlement-reviews')throw new Error('Queue unavailable');
  if(path==='/v1/operator/settlement-reviews/11111111-1111-4111-8111-111111111111/decide'){
    if(state.decisionError)throw Object.assign(new Error('Recovery pending'),{details:{operationId:'decision-1'}});
    if(state.decisionPending)return {operation:{operation_id:'decision-1',state:'pending_unknown'}};
  }
  if(path==='/v1/operator/settlement-case-operations/decision-1')return {operation:{operation_id:'decision-1',state:state.operationState}};
  if(path==='/v1/operator/settlement-reviews/22222222-2222-4222-8222-222222222222'&&state.failSecondDetail)throw new Error('Case detail unavailable');
  return path==='/v1/operator/settlement-reviews'?{queue:[{
    obligation_id:'11111111-1111-4111-8111-111111111111',reason:'driver_silence',
    claimed_at:'2026-09-26T10:00:00.000Z',amount_paise:2500,currency:'INR'},
    {obligation_id:'22222222-2222-4222-8222-222222222222',reason:'dispute',
    claimed_at:'2026-09-26T10:00:00.000Z',amount_paise:3000,currency:'INR'}]}:{
      obligation:{id:'11111111-1111-4111-8111-111111111111',amount_paise:2500,
        currency:'INR',due_at:'2026-09-28T10:00:00.000Z'},
      participants:{driver_id:'driver-1',passenger_id:'passenger-1'},
      claim:{method:'cash',recorded_at:'2026-09-26T10:00:00.000Z'},response:null,
      reports:[],decisions:[],audit:[]};}}));
afterEach(()=>{cleanup();sessionStorage.clear();state.failQueue=false;state.failSecondDetail=false;state.decisionPending=false;state.decisionError=false;state.operationState='pending_unknown';});
it('hides previous evidence and decision controls when the next case cannot load',async()=>{
  state.failSecondDetail=true;
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  expect(await screen.findByText(/Original obligation: INR 25\.00/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/22222222-2222-4222-8222-222222222222/}));
  expect(await screen.findByText(/Case detail unavailable/)).not.toBeNull();
  expect(screen.queryByRole('button',{name:'Record findings'})).toBeNull();
  expect(screen.queryByText(/Original obligation: INR 25\.00/)).toBeNull();
});
it('shows the original obligation amount and due date in the selected operator case',async()=>{
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  expect(await screen.findByText(/Original obligation: INR 25\.00/)).not.toBeNull();
  expect(screen.getByText(/Due /).getAttribute('dateTime')).toBe('2026-09-28T10:00:00.000Z');
});
it('does not claim an unavailable settlement queue is empty',async()=>{
  state.failQueue=true;
  render(<Page/>);
  expect(await screen.findByRole('alert')).not.toBeNull();
  expect(screen.queryByText('No open settlement cases.')).toBeNull();
});
it('previews selected findings, affected people, and case impact before recording',async()=>{
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  fireEvent.change(await screen.findByLabelText('Contribution owed'),{target:{value:'yes'}});
  fireEvent.change(screen.getByLabelText('Receipt established'),{target:{value:'no'}});
  fireEvent.change(screen.getByLabelText('Case outcome'),{target:{value:'resolved'}});
  expect(screen.getByText(/Affected: passenger passenger-1; driver driver-1/)).not.toBeNull();
  expect(screen.getByText(/Contribution owed: yes; receipt established: no/)).not.toBeNull();
  expect(screen.getByText(/Case will be resolved/)).not.toBeNull();
});
it('blocks a final settlement resolution until both findings are selected',async()=>{
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  fireEvent.change(await screen.findByLabelText('Reason'),{target:{value:'Reviewed both accounts'}});
  fireEvent.change(screen.getByLabelText('Case outcome'),{target:{value:'resolved'}});
  expect(screen.getByRole('button',{name:'Record findings'}).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Select both contribution and receipt findings to resolve/)).not.toBeNull();
});
it('lets an operator check an uncertain settlement decision',async()=>{
  state.decisionPending=true;
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  fireEvent.change(await screen.findByLabelText('Reason'),{target:{value:'Reviewed both accounts'}});
  fireEvent.click(screen.getByRole('button',{name:'Record findings'}));
  expect(await screen.findByText(/Decision decision-1 pending/)).not.toBeNull();
  cleanup();render(<Page/>);
  expect(await screen.findByRole('button',{name:'Check settlement decision status'})).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Check settlement decision status'}));
  expect(await screen.findByText(/Decision decision-1 is still pending_unknown/)).not.toBeNull();
});
it('offers a status check when a settlement decision returns a recovery ID with an error',async()=>{
  state.decisionError=true;
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  fireEvent.change(await screen.findByLabelText('Reason'),{target:{value:'Reviewed both accounts'}});
  fireEvent.click(screen.getByRole('button',{name:'Record findings'}));
  expect(await screen.findByText(/Recovery pending/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Check settlement decision status'})).not.toBeNull();
});
