// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import FindRidePage from '../../../../app/find-a-ride/page';

afterEach(cleanup);

it('starts with a truthful gated discovery state and no live offer or booking control',()=>{
  render(<FindRidePage/>);
  expect(screen.getByRole('heading',{name:'Find a ride'})).not.toBeNull();
  expect(screen.getByText(/No public routes to browse/)).not.toBeNull();
  expect(screen.getByText(/prepared route stays private/)).not.toBeNull();
  expect(screen.queryByRole('button',{name:/Request seat/i})).toBeNull();
});

it('walks a labelled synthetic route through ordered points, unavailable server quote and request state',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  expect(screen.getByText(/Synthetic example · not a published ride/)).not.toBeNull();
  expect(screen.getByText(/Route version 1/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Choose pickup and drop-off'}));
  expect(screen.getByText(/Pickup must come before drop-off/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'See quote state'}));
  expect(screen.getByText(/A server quote is unavailable/)).not.toBeNull();
  expect(screen.queryByText(/₹\d/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'See request state'}));
  expect(screen.getByText(/One seat for yourself/)).not.toBeNull();
  expect(screen.getByText(/No request was sent/)).not.toBeNull();
  expect(screen.queryByRole('button',{name:/Confirm request/i})).toBeNull();
});

it('blocks reversed sample points and moves keyboard focus to each new stage',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  expect(document.activeElement).toBe(screen.getByRole('heading',{name:'See the route before choosing a place'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose pickup and drop-off'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Pickup'}),{target:{value:'2'}});
  expect(screen.getByRole('alert').textContent).toMatch(/drop-off after your pickup/);
  expect((screen.getByRole('button',{name:'See quote state'}) as HTMLButtonElement).disabled).toBe(true);
});
