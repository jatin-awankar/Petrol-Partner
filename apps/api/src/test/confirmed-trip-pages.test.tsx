// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SearchRidesPage from "../../../../app/search-rides/page";
import PostRide from "../../../../app/post-a-ride/page";

const session = vi.hoisted(() => ({userId:"passenger",bookings:[] as Array<Record<string,unknown>>}));
vi.mock("next/navigation",() => ({useRouter:() => ({replace:vi.fn()})}));
vi.mock("@/hooks/auth/useCurrentUser",() => ({useCurrentUser:() => ({
  isAuthenticated:true,loading:false,user:{id:session.userId}})}));
vi.mock("@/lib/api/client",() => ({apiRequest:async(path:string) => {
  if (path === "/v1/corridor-offers/policy") return {policy:{version:1,provisional:true,
    currency:"INR",schedule_start:"08:00:00",schedule_end:"18:00:00",weekdays:[1,2,3,4,5,6],
    stops:[],permitted_pairs:[],cancellation_notice:"Contact support to cancel.",
    contact_notice:"Participant phone numbers are never shared."}};
  if (path === "/v1/verification/overview") return {vehicles:[]};
  if (path === "/v1/seat-requests") return {requests:[]};
  if (path === "/v1/seat-requests/confirmed") return {bookings:session.bookings};
  throw new Error(`Unexpected request ${path}`);
}}));

afterEach(() => {cleanup();session.userId="passenger";session.bookings=[];});

const booking = {id:"booking",offer_id:"offer",contribution_paise:2500,currency:"INR",
  departure_at:"2026-09-26T12:00:00.000Z",status:"confirmed",origin_code:"university",
  destination_code:"prmitr",driver_id:"driver",passenger_id:"passenger",
  passenger_origin_code:"university",passenger_destination_code:"prmitr",
  pickup_location:"Amravati University",car_registration_last4:"1234",car_make:"Tata",
  car_model:"Tiago",car_color:"Blue",driver_verified_name:"Verified Driver",
  passenger_verified_name:"Verified Passenger"};

describe("pilot coordination notice on offer and request pages",() => {
  it("tells a driver before publication that operator support contact and hours are unpublished",async() => {
    render(<PostRide />);
    expect(await screen.findByText(/Support contact and operating hours are not yet published/i)).not.toBeNull();
  });
  it("tells a passenger before requesting that operator support contact and hours are unpublished",async() => {
    render(<SearchRidesPage />);
    expect(await screen.findByText(/Support contact and operating hours are not yet published/i)).not.toBeNull();
  });
  it("shows the confirmed passenger the verified driver and limited car details",async() => {
    session.bookings=[booking];
    render(<SearchRidesPage />);
    expect(await screen.findByText(/Driver: Verified Driver/)).not.toBeNull();
    expect(screen.getByText(/registration ending 1234/)).not.toBeNull();
    expect(screen.queryByText(/Passenger: Verified Passenger/)).toBeNull();
  });
  it("shows the driver each confirmed passenger's verified name and stops",async() => {
    session.userId="driver";
    session.bookings=[booking,{...booking,id:"booking-two",passenger_id:"passenger-two",
      passenger_verified_name:"Second Passenger",passenger_origin_code:"prmitr"}];
    render(<SearchRidesPage />);
    expect(await screen.findByText(/Passenger: Verified Passenger; university → prmitr/)).not.toBeNull();
    expect(screen.getByText(/Passenger: Second Passenger; prmitr → prmitr/)).not.toBeNull();
    expect(screen.queryByText(/Driver: Verified Driver/)).toBeNull();
  });
});
