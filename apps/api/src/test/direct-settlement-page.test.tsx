// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import Page from '../../../../app/direct-settlements/page';
const state=vi.hoisted(()=>({actor:'passenger',calls:[] as Array<{path:string;key:string|undefined}>,
  item:{obligation_id:'obligation',amount_paise:2500,currency:'INR',due_at:'2026-09-28T10:00:00Z',
    driver_id:'driver',passenger_id:'passenger',claim:null as null|{id:string;method:string;recorded_at:string},
    receipt:null as null|{id:string;recorded_at:string},response:null as null|string,
    review:null as null|{id:string|null;reason:string},status:'due'}}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()})}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({isAuthenticated:true,
  loading:false,user:{id:state.actor}})}));
vi.mock('@/lib/api/client',()=>({apiRequest:async(path:string,init?:{headers?:Record<string,string>})=>{
  if(path==='/v1/direct-settlements') return {obligations:[state.item]};
  state.calls.push({path,key:init?.headers?.['Idempotency-Key']});
  if(path.endsWith('/claim')){state.item.claim={id:'claim',method:'upi',recorded_at:new Date().toISOString()};
    state.item.status='claim_pending';}
  if(path.endsWith('/confirm')){state.item.receipt={id:'receipt',recorded_at:new Date().toISOString()};
    state.item.response='confirm';state.item.status='settled';}
  return {operation_id:'operation',state:'acknowledged'};
}}));
afterEach(()=>{cleanup();state.actor='passenger';state.calls=[];state.item.claim=null;
  state.item.receipt=null;state.item.response=null;state.item.review=null;state.item.status='due';});
describe('direct settlement browser journey',()=>{
  it('keeps a passenger claim pending until the driver records receipt',async()=>{
    const view=render(<Page/>);
    fireEvent.click(await screen.findByRole('button',{name:'Report UPI paid'}));
    expect(await screen.findByText(/driver must confirm receipt before this is settled/i)).not.toBeNull();
    expect(screen.getByText(/claim pending/i)).not.toBeNull();
    expect(state.calls[0].key).toBeTruthy();
    state.actor='driver';view.unmount();render(<Page/>);
    fireEvent.click(await screen.findByRole('button',{name:'Confirm receipt'}));
    await waitFor(()=>expect(screen.getByText(/settled/i)).not.toBeNull());
    expect(state.calls.map(x=>x.path)).toEqual([
      '/v1/direct-settlements/obligation/claim','/v1/direct-settlements/obligation/confirm']);
  });
});
