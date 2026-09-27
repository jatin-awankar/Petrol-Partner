// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SearchRidesPage from "../../../../app/search-rides/page";
import PostRide from "../../../../app/post-a-ride/page";

const session = vi.hoisted(() => ({userId:"passenger",bookings:[] as Array<Record<string,unknown>>,
  calls:[] as Array<{path:string;body:unknown;key:string|undefined}>}));
vi.mock("next/navigation",() => ({useRouter:() => ({replace:vi.fn()})}));
vi.mock("@/hooks/auth/useCurrentUser",() => ({useCurrentUser:() => ({
  isAuthenticated:true,loading:false,user:{id:session.userId}})}));
vi.mock("@/lib/api/client",() => ({apiRequest:async(path:string,init?:{body?:string;headers?:Record<string,string>}) => {
  if(path.endsWith("/complete")||path.endsWith("/confirm")){
    const body=JSON.parse(init?.body??"{}");
    session.calls.push({path,body,key:init?.headers?.["Idempotency-Key"]});
    if(path.endsWith("/complete")) session.bookings=session.bookings.map(row=>({...row,
      driver_recorded_at:"2026-09-27T10:00:00.000Z",driver_travelled:true,driver_completed:true}));
    else session.bookings=session.bookings.map(row=>row.id===path.split("/").at(-2)?{...row,
      passenger_recorded_at:"2026-09-27T10:01:00.000Z",passenger_travelled:body.travelled,
      passenger_completed:body.completed}:row);
    return path.endsWith("/complete")?{completion:{state:"acknowledged"}}:{confirmation:{state:"acknowledged"}};
  }
  if (path === "/v1/corridor-offers/policy") return {policy:{version:1,provisional:true,
    currency:"INR",schedule_start:"08:00:00",schedule_end:"18:00:00",weekdays:[1,2,3,4,5,6],
    stops:[],permitted_pairs:[],cancellation_notice:"Contact support to cancel.",
    contact_notice:"Participant phone numbers are never shared."}};
  if (path === "/v1/verification/overview") return {vehicles:[]};
  if (path === "/v1/seat-requests") return {requests:[]};
  if (path === "/v1/seat-requests/confirmed") return {bookings:session.bookings};
  throw new Error(`Unexpected request ${path}`);
}}));

afterEach(() => {cleanup();session.userId="passenger";session.bookings=[];session.calls=[];});

const booking = {id:"booking",offer_id:"offer",contribution_paise:2500,currency:"INR",
  departure_at:"2026-09-26T12:00:00.000Z",status:"confirmed",origin_code:"university",
  destination_code:"prmitr",driver_id:"driver",passenger_id:"passenger",
  passenger_origin_code:"university",passenger_destination_code:"prmitr",
  pickup_location:"Amravati University",car_registration_last4:"1234",car_make:"Tata",
  car_model:"Tiago",car_color:"Blue",driver_verified_name:"Verified Driver",
  passenger_verified_name:"Verified Passenger",trip_state:"scheduled",boarded:null,started_at:null};

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
    expect(screen.queryByRole("button",{name:/Start trip and record boarding/})).toBeNull();
  });
  it("shows the driver each confirmed passenger's verified name and stops",async() => {
    session.userId="driver";
    session.bookings=[booking,{...booking,id:"booking-two",passenger_id:"passenger-two",
      passenger_verified_name:"Second Passenger",passenger_origin_code:"prmitr"}];
    render(<SearchRidesPage />);
    expect(await screen.findByText(/Passenger: Verified Passenger; university → prmitr/)).not.toBeNull();
    expect(screen.getByText(/Passenger: Second Passenger; prmitr → prmitr/)).not.toBeNull();
    expect(screen.queryByText(/Driver: Verified Driver/)).toBeNull();
    expect(screen.getByRole("button",{name:/Start trip and record boarding/})).not.toBeNull();
  });
  it("excludes a canceled historical seat from boarding choices",async()=>{
    session.userId="driver";
    session.bookings=[booking,{...booking,id:"canceled",status:"cancelled",
      passenger_verified_name:"Former Passenger"}];
    render(<SearchRidesPage />);
    expect(await screen.findByText(/Passenger: Former Passenger/)).not.toBeNull();
    expect(screen.queryByLabelText("Former Passenger")).toBeNull();
  });
  it("shows delayed and departed states without offering an automatic transition",async()=>{
    session.bookings=[{...booking,trip_state:"delayed"}];
    render(<SearchRidesPage />);
    expect(await screen.findByText(/ride remains unstarted/i)).not.toBeNull();
    expect(screen.queryByRole("button",{name:/Start trip and record boarding/})).toBeNull();
  });
  it("lets the driver report a distinct outcome for each boarded passenger",async()=>{
    session.userId="driver";
    session.bookings=[{...booking,trip_state:"departed",boarded:true},
      {...booking,id:"second",passenger_id:"second",passenger_verified_name:"Second Passenger",
        trip_state:"departed",boarded:true}];
    render(<SearchRidesPage />);
    const controls=await screen.findAllByRole("combobox",{name:/Journey outcome for/});
    fireEvent.change(controls[0],{target:{value:"completed"}});
    fireEvent.change(controls[1],{target:{value:"interrupted"}});
    fireEvent.click(screen.getByRole("button",{name:"Record driver completion"}));
    await waitFor(()=>expect(session.calls).toHaveLength(1));
    expect(session.calls[0].path).toBe("/v1/corridor-offers/offer/complete");
    expect(session.calls[0].body).toEqual({claims:[
      {allocation_id:"booking",travelled:true,completed:true},
      {allocation_id:"second",travelled:true,completed:false}]});
    expect(session.calls[0].key).toBeTruthy();
  });
  it("lets a passenger confirm only their own boarded journey",async()=>{
    session.bookings=[{...booking,trip_state:"departed",boarded:true,
      driver_recorded_at:"2026-09-27T10:00:00.000Z",driver_travelled:true,driver_completed:true}];
    render(<SearchRidesPage />);
    fireEvent.change(await screen.findByRole("combobox",{name:/Journey outcome for/}),
      {target:{value:"did_not_travel"}});
    fireEvent.click(screen.getByRole("button",{name:"Confirm my journey"}));
    await waitFor(()=>expect(session.calls).toHaveLength(1));
    expect(session.calls[0].path).toBe("/v1/corridor-offers/offer/journeys/booking/confirm");
    expect(session.calls[0].body).toEqual({travelled:false,completed:false});
  });
});
