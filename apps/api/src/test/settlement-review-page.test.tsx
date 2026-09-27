// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import Page from '../../../../app/operator/settlement-reviews/page';
vi.mock('@/lib/api/client',()=>({ApiError:class ApiError extends Error{},
  apiRequest:async(path:string)=>path==='/v1/operator/settlement-reviews'?{queue:[{
    obligation_id:'11111111-1111-4111-8111-111111111111',reason:'driver_silence',
    claimed_at:'2026-09-26T10:00:00.000Z',amount_paise:2500,currency:'INR'}]}:{
      obligation:{id:'11111111-1111-4111-8111-111111111111',amount_paise:2500,
        currency:'INR',due_at:'2026-09-28T10:00:00.000Z'},
      claim:{method:'cash',recorded_at:'2026-09-26T10:00:00.000Z'},response:null,
      reports:[],decisions:[],audit:[]}}));
afterEach(()=>cleanup());
it('shows the original obligation amount and due date in the selected operator case',async()=>{
  render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:/11111111-1111-4111-8111-111111111111/}));
  expect(await screen.findByText(/Original obligation: INR 25\.00/)).not.toBeNull();
  expect(screen.getByText(/Due /).getAttribute('dateTime')).toBe('2026-09-28T10:00:00.000Z');
});
