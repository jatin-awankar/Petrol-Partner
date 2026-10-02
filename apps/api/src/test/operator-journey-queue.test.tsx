// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {JourneyReviewQueue} from '../../../../components/pilot/JourneyReviewQueue';

const state=vi.hoisted(()=>({operationState:'pending_unknown',decisionError:false,failQueue:false,holdQueue:false,releaseQueue:null as (()=>void)|null}));
vi.mock('@/lib/api/client',()=>({apiRequest:async(path:string,options?:{method?:string})=>{
  if(path==='/v1/operator/journey-reviews'){
    if(state.holdQueue)await new Promise<void>(resolve=>{state.releaseQueue=resolve;});
    if(state.failQueue)throw new Error('Queue unavailable');
    return {cases:[{id:'case-1',offer_id:'ride-1',passenger_id:'person-1',reason:'conflicting statements',status:'open',latest_outcome:null}]};
  }
  if(path==='/v1/operator/journey-reviews/case-1/decide'&&options?.method==='POST'){
    if(state.decisionError)throw Object.assign(new Error('Recovery pending'),{details:{operationId:'decision-1'}});
    return {operation:{operation_id:'decision-1',state:'pending_unknown'}};
  }
  if(path==='/v1/operator/journey-reviews/case-1')return {case:{id:'case-1',offer_id:'ride-1',allocation_id:'seat-1',review_reason:'conflicting statements',status:'open',frozen_paise:2500,currency:'INR',driver_travelled:true,driver_completed:true,passenger_travelled:false,passenger_completed:false,obligation_paise:null,obligation_due_at:null,outcome:null,contribution_owed:null},decisions:[]};
  if(path==='/v1/operator/journey-review-decisions/decision-1')return {operation:{operation_id:'decision-1',state:state.operationState}};
  throw new Error(`Unexpected request ${path}`);
}}));
afterEach(()=>{state.releaseQueue?.();cleanup();state.operationState='pending_unknown';state.decisionError=false;state.failQueue=false;state.holdQueue=false;state.releaseQueue=null;sessionStorage.clear();});

it('lets an operator check a pending journey decision until it is recovered',async()=>{
  render(<JourneyReviewQueue/>);
  fireEvent.click(await screen.findByRole('button',{name:/Ride ride-1/}));
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Reviewed both statements'}});
  fireEvent.click(screen.getByRole('button',{name:'Record decision'}));
  expect(await screen.findByText(/Decision decision-1 is pending_unknown/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Check decision status'}));
  expect(await screen.findByText(/Decision decision-1 is still pending_unknown/)).not.toBeNull();
  state.operationState='recovered';
  fireEvent.click(screen.getByRole('button',{name:'Check decision status'}));
  expect(await screen.findByText(/Decision decision-1: recovered/)).not.toBeNull();
});
it('offers a status check when a journey decision returns an operation ID with an error',async()=>{
  state.decisionError=true;
  render(<JourneyReviewQueue/>);
  fireEvent.click(await screen.findByRole('button',{name:/Ride ride-1/}));
  fireEvent.change(await screen.findByLabelText('Decision reason'),{target:{value:'Reviewed both statements'}});
  fireEvent.click(screen.getByRole('button',{name:'Record decision'}));
  expect(await screen.findByText(/Decision outcome uncertain/)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Check decision status'})).not.toBeNull();
});
it('does not call an unavailable journey review queue empty',async()=>{
  state.failQueue=true;
  render(<JourneyReviewQueue/>);
  expect(await screen.findByText('Journey review queue unavailable.')).not.toBeNull();
  expect(screen.queryByText('No open journey reviews.')).toBeNull();
});
it('shows the journey queue as loading until its first read completes',()=>{
  state.holdQueue=true;
  render(<JourneyReviewQueue/>);
  expect(screen.getByText('Loading journey reviews…')).not.toBeNull();
  expect(screen.queryByText('No open journey reviews.')).toBeNull();
  state.releaseQueue?.();
});
