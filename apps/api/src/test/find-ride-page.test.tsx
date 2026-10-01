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

it('previews quoted terms and a pending one-seat request without sending a real request',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose pickup and drop-off'}));
  fireEvent.click(screen.getByRole('button',{name:'See quote state'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview sample quote'}));
  expect(screen.getByText('4 km · sample segment')).not.toBeNull();
  expect(screen.getByText('₹20 · INR · sample only')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Review one-seat request'}));
  expect(screen.getByText(/one passenger.*₹20/i)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Preview pending request'}));
  expect(screen.getByRole('heading',{name:'Pending · sample'})).not.toBeNull();
  expect(screen.getByText(/No real request was sent\. A pending request awaits the driver's decision; your seat is not confirmed\./i)).not.toBeNull();
});

it('shows a matching route and a failed discovery as distinct synthetic states',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview matching routes'}));
  expect(screen.getByRole('heading',{name:'One matching route · sample'})).not.toBeNull();
  expect(screen.getByText(/Route version 1 · sample/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Preview discovery failure'}));
  expect(screen.getByRole('heading',{name:'Discovery failed · sample'})).not.toBeNull();
  expect(screen.getByRole('button',{name:'Retry sample discovery'})).not.toBeNull();
});

it('previews a loading discovery state separately from the empty production state',()=>{
  render(<FindRidePage/>);
  expect(screen.getByRole('heading',{name:'No public routes to browse'})).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview discovery loading'}));
  expect(screen.getByRole('heading',{name:'Loading routes · sample'})).not.toBeNull();
  expect(screen.queryByText(/One matching route · sample/)).toBeNull();
});

it('previews stale quote and account restriction as blocked states',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose pickup and drop-off'}));
  fireEvent.click(screen.getByRole('button',{name:'See quote state'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview sample quote'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview stale quote'}));
  expect(screen.getByRole('heading',{name:'Quote expired · sample'})).not.toBeNull();
  expect(screen.queryByRole('button',{name:'Review one-seat request'})).toBeNull();
  expect(screen.queryByText('₹20 · INR · sample only')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Preview account restriction'}));
  expect(screen.getByRole('heading',{name:'Request restricted · sample'})).not.toBeNull();
  expect(screen.queryByRole('button',{name:'Review one-seat request'})).toBeNull();
});

it('renders each synthetic request outcome with its next action',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose pickup and drop-off'}));
  fireEvent.click(screen.getByRole('button',{name:'See quote state'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview sample quote'}));
  fireEvent.click(screen.getByRole('button',{name:'Review one-seat request'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview pending request'}));
  for(const status of ['Accepted','Rejected','Expired','Withdrawn','Cancelled','Held','Result unknown']){
    fireEvent.change(screen.getByRole('combobox',{name:'Preview request outcome'}),{target:{value:status}});
    expect(screen.getByRole('heading',{name:`${status} · sample`})).not.toBeNull();
  }
  expect(screen.getByText(/look up the recorded operation before retrying/i)).not.toBeNull();
  expect(screen.getByText(/No real request was sent/i)).not.toBeNull();
});

it('keeps sample terms aligned with the selected ordered segment',()=>{
  render(<FindRidePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Explore synthetic example'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose pickup and drop-off'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Pickup'}),{target:{value:'1'}});
  fireEvent.click(screen.getByRole('button',{name:'See quote state'}));
  fireEvent.click(screen.getByRole('button',{name:'Preview sample quote'}));
  expect(screen.getByText('2 km · sample segment')).not.toBeNull();
  expect(screen.getByText('₹10 · INR · sample only')).not.toBeNull();
});
