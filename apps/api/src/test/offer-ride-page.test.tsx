// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import OfferRidePage from '../../../../app/offer-a-ride/page';

afterEach(cleanup);

it('shows the real gate and declaration path without a live publication control',()=>{
  render(<OfferRidePage/>);
  expect(screen.getByRole('heading',{name:'Offer a ride'})).not.toBeNull();
  expect(screen.getByText(/production routing provider is unavailable/i)).not.toBeNull();
  expect(screen.getByRole('link',{name:/manage declarations/i}).getAttribute('href')).toBe('/driver-vehicle-declarations');
  expect(screen.queryByRole('button',{name:/publish offer/i})).toBeNull();
});

it('does not show a declared sample vehicle inside the missing-declaration state',()=>{
  render(<OfferRidePage/>);
  expect(screen.getByRole('heading',{name:/Vehicle declaration needed/i})).not.toBeNull();
  expect(screen.queryByRole('combobox',{name:'Sample declared vehicle'})).toBeNull();
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'input'}});
  expect(screen.getByRole('combobox',{name:'Sample declared vehicle'})).not.toBeNull();
});

it('keeps prepared private and published illustrative states distinct',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'prepared'}});
  expect(screen.getByRole('heading',{name:/Prepared · private/i})).not.toBeNull();
  expect(screen.getByText(/passengers cannot find it/i)).not.toBeNull();
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'published'}});
  expect(screen.getByRole('heading',{name:/Published · illustrative/i})).not.toBeNull();
  expect(screen.getByText(/No offer was published/i)).not.toBeNull();
});

it('places accepted segment and contribution freezing at acknowledgement, not first request',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'published'}});
  expect(screen.getByText(/Only an acknowledged acceptance would freeze each passenger's selected segment and integer-paise contribution/i)).not.toBeNull();
  expect(screen.queryByText(/frozen material terms after its first request/i)).toBeNull();
});

it('labels route posting and decision cutoffs as proposed sample timing',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'input'}});
  expect(screen.getByText(/Proposed example: departure 2 hours to 7 days ahead/i)).not.toBeNull();
  expect(screen.getByText(/Proposed timing: requests close 60 minutes before departure/i)).not.toBeNull();
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'full'}});
  expect(screen.getByText(/Proposed sample decision cutoff: 16:30 IST/i)).not.toBeNull();
});

it('describes route preparation failure without claiming a passenger stop check ran',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'verification'}});
  expect(screen.getByText(/Route verification could not confirm a usable driver route/i)).not.toBeNull();
  expect(screen.queryByText(/stopping-place check/i)).toBeNull();
});

it('names the full accepted terms as frozen only after acknowledgement',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'accepted'}});
  expect(screen.getByText(/freeze route version, selected segment, saved-route distance source, rate, rounding, policy version, currency, and integer-paise total/i)).not.toBeNull();
});

it('explains deadlines and recovery for decision and cancellation states',()=>{
  render(<OfferRidePage/>);
  for(const state of ['pending','accepted','rejected','full','cancelled','replacement','unknown']){
    fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:state}});
    expect(screen.getByText(/Who acts next:/i)).not.toBeNull();
    expect(screen.getByText(/By when:/i)).not.toBeNull();
  }
  expect(screen.getByText(/same idempotency key/i)).not.toBeNull();
  expect(screen.queryByRole('button',{name:/accept|reject|cancel|replace/i})).toBeNull();
});

it('shows a selected declared vehicle and its sample route, departure and capacity',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'input'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Sample declared vehicle'}),{target:{value:'car'}});
  expect(screen.getByText(/sample declared car · 3 belted passenger seats · self-declared, not verified/i)).not.toBeNull();
  expect(screen.getByText(/sample origin → sample destination/i)).not.toBeNull();
  expect(screen.getByDisplayValue('Sample travel day · 17:00 IST')).not.toBeNull();
  expect(screen.getByDisplayValue('3 whole-ride passenger seats')).not.toBeNull();
});

it('lets the driver inspect a synthetic pending request and its quoted route terms',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'pending'}});
  expect(screen.getByRole('heading',{name:'Sample incoming request'})).not.toBeNull();
  expect(screen.getByText(/route version 1 · sample origin → sample midpoint → sample destination/i)).not.toBeNull();
  expect(screen.getByText(/pickup sample origin · drop-off sample destination/i)).not.toBeNull();
  expect(screen.getByText(/4 km saved-route segment · ₹5\/km · INR 2,000 paise/i)).not.toBeNull();
  expect(screen.getByText(/one seat requested · pending, no capacity allocated/i)).not.toBeNull();
  expect(screen.getByText(/requests close 16:00 IST · decide by 16:30 IST/i)).not.toBeNull();
  expect(screen.queryByRole('button',{name:/accept request|reject request/i})).toBeNull();
});

it('keeps the synthetic request terms aligned with the selected declared car',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'input'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Sample declared vehicle'}),{target:{value:'car'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'pending'}});
  expect(screen.getByText(/4 km saved-route segment · ₹7\/km · INR 2,800 paise/i)).not.toBeNull();
  expect(screen.getByText(/sample declared car · 3 whole-ride passenger seats/i)).not.toBeNull();
});

it('shows full capacity for the selected sample vehicle',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'input'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Sample declared vehicle'}),{target:{value:'car'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'full'}});
  expect(screen.getByText(/sample car has three declared passenger seats and three acknowledged allocations/i)).not.toBeNull();
  expect(screen.queryByText(/vehicle has one declared passenger seat/i)).toBeNull();
});

it('shows the selected vehicle and route terms in the private prepared state',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'input'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Sample declared vehicle'}),{target:{value:'car'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'prepared'}});
  const summary=within(screen.getByRole('region',{name:'Private route summary'}));
  expect(summary.getByText(/Route version 1 · Sample origin → Sample destination/)).not.toBeNull();
  expect(summary.getByText(/Sample declared car · 3 whole-ride passenger seats/)).not.toBeNull();
  expect(summary.getByText(/Departure 17:00 IST on the sample travel day/)).not.toBeNull();
  expect(summary.getByText(/Prepared and driver-private; no route was saved or published/)).not.toBeNull();
});

it('announces a short state change without reading the entire driver guide',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'prepared'}});
  expect(screen.getByRole('status').textContent).toBe('Preview state: Prepared · private · sample');
  expect(screen.getByRole('article').getAttribute('aria-live')).toBeNull();
});
