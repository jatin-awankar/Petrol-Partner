// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
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

it('keeps prepared private and published illustrative states distinct',()=>{
  render(<OfferRidePage/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'prepared'}});
  expect(screen.getByRole('heading',{name:/Prepared · private/i})).not.toBeNull();
  expect(screen.getByText(/passengers cannot find it/i)).not.toBeNull();
  fireEvent.change(screen.getByRole('combobox',{name:'Preview driver state'}),{target:{value:'published'}});
  expect(screen.getByRole('heading',{name:/Published · illustrative/i})).not.toBeNull();
  expect(screen.getByText(/No offer was published/i)).not.toBeNull();
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
