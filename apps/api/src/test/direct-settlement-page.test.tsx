// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
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
    expect(await screen.findByText(/INR 2,500 paise/)).not.toBeNull();
    expect(screen.getByText(/A passenger claim is a report, not proof of receipt/)).not.toBeNull();
    fireEvent.click(await screen.findByRole('button',{name:'Report UPI sent'}));
    expect(await screen.findByText(/driver must confirm receipt before this is settled/i)).not.toBeNull();
    expect(screen.getByText(/claim pending/i)).not.toBeNull();
    expect(screen.getByText(/Awaiting driver receipt unless shown below/)).not.toBeNull();
    expect(state.calls[0].key).toBeTruthy();
    state.actor='driver';view.unmount();render(<Page/>);
    fireEvent.click(await screen.findByRole('button',{name:'Confirm receipt'}));
    await waitFor(()=>expect(screen.getByText('settled',{exact:true})).not.toBeNull());
    expect(state.calls.map(x=>x.path)).toEqual([
      '/v1/direct-settlements/obligation/claim','/v1/direct-settlements/obligation/confirm']);
  });
  it('removes driver response actions at the exact 24-hour claim deadline',async()=>{
    const deadline=Date.now()+60_000;
    state.actor='driver';
    state.item.claim={id:'claim',method:'cash',recorded_at:new Date(deadline-86_400_000).toISOString()};
    state.item.status='claim_pending';
    vi.useFakeTimers();
    try{
      vi.setSystemTime(new Date(deadline-60_000));
      render(<Page/>);
      await act(async()=>{});
      expect(screen.getByRole('button',{name:'Confirm receipt'})).not.toBeNull();
      await act(async()=>{vi.advanceTimersByTime(60_000);});
      expect(screen.queryByRole('button',{name:'Confirm receipt'})).toBeNull();
    }finally{vi.useRealTimers();}
  });
  it('keeps overdue and operator-review examples synthetic and separate from receipt',async()=>{
    render(<Page/>);
    fireEvent.change(screen.getByLabelText('Contribution state'),{target:{value:'overdue'}});
    expect(screen.getByText(/Time does not create a claim or receipt/)).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Contribution state'),{target:{value:'review'}});
    expect(screen.getByText(/Silence does not establish receipt/)).not.toBeNull();
    expect(state.calls).toHaveLength(0);
  });
});
