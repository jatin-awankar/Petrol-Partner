// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import TripsPage from "../../../../app/trips/page";
const fixture=vi.hoisted(()=>({actor:"passenger",fail:false,bookings:[] as Record<string,unknown>[],calls:[] as string[]}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn()})}));
vi.mock("@/hooks/auth/useCurrentUser",()=>({useCurrentUser:()=>({isAuthenticated:true,loading:false,user:{id:fixture.actor}})}));
vi.mock("@/lib/api/client",()=>({apiRequest:async(path:string)=>{fixture.calls.push(path);
  if(fixture.fail)throw new Error("Read unavailable");
  if(path==="/v1/seat-requests/confirmed")return {bookings:fixture.bookings};
  if(path==="/v1/seat-requests/journey-reviews")return {cases:[]};
  throw new Error("Unexpected request");}}));
afterEach(()=>{cleanup();fixture.actor="passenger";fixture.fail=false;fixture.bookings=[];fixture.calls=[];});
const booking={id:"allocation",driver_id:"driver",passenger_id:"passenger",departure_at:"2026-10-03T11:30:00Z",
  status:"confirmed",trip_state:"delayed",contribution_paise:2500,currency:"INR",origin_code:"university",
  destination_code:"prmitr",boarded:null,driver_recorded_at:null,passenger_recorded_at:null,
  obligation_paise:null,obligation_due_at:null,journey_review_reason:null};
describe("Trips rendered state",()=>{
  it("shows the recorded role and frozen terms without inventing travel after departure",async()=>{
    fixture.bookings=[booking];render(<TripsPage/>);
    expect(await screen.findByText(/HISTORICAL FIXED CORRIDOR · PASSENGER/)).not.toBeNull();
    expect(screen.getByText(/INR 2,500 paise/)).not.toBeNull();
    expect(screen.getByText(/No journey statements recorded/)).not.toBeNull();
    expect(screen.getByText(/Boarding: not recorded/)).not.toBeNull();
    expect(fixture.calls).toEqual(["/v1/seat-requests/confirmed","/v1/seat-requests/journey-reviews"]);
  });
  it("keeps silence and unknown-result examples visibly synthetic",async()=>{
    render(<TripsPage/>);await screen.findByText(/No recent upcoming commitment/);
    fireEvent.change(screen.getByLabelText("Journey state"),{target:{value:"silence"}});
    expect(screen.getByText(/Do not infer travel or debt from elapsed time/)).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Journey state"),{target:{value:"unknown"}});
    expect(screen.getByText(/same key and payload/)).not.toBeNull();
    expect(fixture.calls).toHaveLength(2);
  });
  it("shows a retryable read error without a false empty state",async()=>{
    fixture.fail=true;render(<TripsPage/>);
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toMatch(/Could not load records/));
    expect(screen.queryByText(/No recent upcoming commitment/)).toBeNull();
  });
});
