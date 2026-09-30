// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import NotificationsPage from '../../../../app/notifications/page';
const mark=vi.fn();
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({user:{id:'person'},loading:false})}));
vi.mock('@/lib/api/backend',()=>({listNotifications:async()=>({notifications:[{id:'notice',title:'Update',body:'Your account changed',status:'unread'}]}),markNotificationRead:(...args:unknown[])=>mark(...args)}));
afterEach(()=>{cleanup();mark.mockReset();});
it('shows a retryable uncertain result when marking a notice read fails',async()=>{
  mark.mockRejectedValue(new Error('Connection lost'));
  render(<NotificationsPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Mark as read'}));
  expect(await screen.findByText(/could not confirm whether this notice was marked as read/i)).not.toBeNull();
  expect(screen.getByRole('button',{name:'Check again'})).not.toBeNull();
});
