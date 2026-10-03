// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import SupportPage from '../../../../app/support/page';

afterEach(cleanup);
it('publishes controlled contacts with approved coverage and explicit prelaunch limits',()=>{
  render(<SupportPage/>);
  expect(screen.getByRole('heading',{name:'Help and support'})).not.toBeNull();
  for(const email of ['jatinawankar23@gmail.com','supportpp@gmail.com'])
    expect(screen.getByRole('link',{name:email}).getAttribute('href')).toBe(`mailto:${email}`);
  expect(screen.getByText(/Monday–Friday, 09:00–18:00 IST/)).not.toBeNull();
  expect(screen.getByText(/within 15 minutes/)).not.toBeNull();
  expect(screen.getByText(/nine covered hours/)).not.toBeNull();
  expect(screen.getByText(/No independent active-trip escalation arrangement is established/)).not.toBeNull();
  expect(screen.getByText(/real bookings remain disabled/)).not.toBeNull();
  expect(screen.queryByText(/support@pp.com/)).toBeNull();
});
