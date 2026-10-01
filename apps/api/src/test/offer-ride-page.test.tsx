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
