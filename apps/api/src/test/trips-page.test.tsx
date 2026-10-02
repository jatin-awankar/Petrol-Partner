// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import TripsPage from "../../../../app/trips/page";
const fixture=vi.hoisted(()=>({actor:"passenger",fail:false,bookings:[] as Record<string,unknown>[],
  reviews:[] as Record<string,unknown>[],calls:[] as string[]}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn()})}));
vi.mock("@/hooks/auth/useCurrentUser",()=>({useCurrentUser:()=>({isAuthenticated:true,loading:false,user:{id:fixture.actor}})}));
vi.mock("@/lib/api/client",()=>({apiRequest:async(path:string)=>{fixture.calls.push(path);
  if(fixture.fail)throw new Error("Read unavailable");
  if(path==="/v1/seat-requests/confirmed")return {bookings:fixture.bookings};
  if(path==="/v1/seat-requests/journey-reviews")return {cases:fixture.reviews};
  throw new Error("Unexpected request");}}));
afterEach(()=>{cleanup();fixture.actor="passenger";fixture.fail=false;fixture.bookings=[];
  fixture.reviews=[];fixture.calls=[];});
const booking={id:"allocation",driver_id:"driver",passenger_id:"passenger",departure_at:"2026-10-03T11:30:00Z",
  status:"confirmed",trip_state:"delayed",contribution_paise:2500,currency:"INR",origin_code:"university",
  destination_code:"prmitr",boarded:null,driver_recorded_at:null,passenger_recorded_at:null,
  obligation_paise:null,obligation_due_at:null,journey_review_reason:null};
describe("Trips rendered state",()=>{
  it("uses the root main landmark and its unique skip target",()=>{
    const {container}=render(<main id="main-content"><TripsPage/></main>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(container.querySelectorAll("#main-content")).toHaveLength(1);
  });
  it("shows the recorded role and frozen terms without inventing travel after departure",async()=>{
    fixture.bookings=[booking];render(<TripsPage/>);
    expect(await screen.findByText(/HISTORICAL FIXED CORRIDOR · PASSENGER/)).not.toBeNull();
    expect(screen.getByText(/INR 2,500 paise/)).not.toBeNull();
    expect(screen.getByText(/No journey statements recorded/)).not.toBeNull();
    expect(screen.getByText(/Boarding: not recorded/)).not.toBeNull();
    expect(fixture.calls).toEqual(["/v1/seat-requests/confirmed","/v1/seat-requests/journey-reviews"]);
  });
  it("shows the passenger's response deadline after the driver records a journey statement",async()=>{
    fixture.bookings=[{...booking,trip_state:"departed",boarded:true,
      driver_recorded_at:"2026-10-03T12:00:00Z"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Driver statement recorded; passenger response needed/)).closest("article");
    expect(card?.textContent).toContain("Actor: Passenger");
    expect(card?.textContent).toContain("By: 4 Oct 2026, 5:30 pm IST");
  });
  it("assigns a recorded contribution obligation to the passenger",async()=>{
    fixture.bookings=[{...booking,trip_state:"departed",boarded:true,
      driver_recorded_at:"2026-10-03T12:00:00Z",passenger_recorded_at:"2026-10-03T12:05:00Z",
      obligation_paise:2500,obligation_due_at:"2026-10-04T12:05:00Z"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Open Contributions for the separate obligation/)).closest("article");
    expect(card?.textContent).toContain("Actor: Passenger");
    expect(card?.textContent).toContain("By: 4 Oct 2026, 5:35 pm IST");
  });
  it("asks the driver to record the journey after departure without inventing a deadline",async()=>{
    fixture.bookings=[{...booking,trip_state:"departed",boarded:true}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/No journey statements recorded/)).closest("article");
    expect(card?.textContent).toContain("Next: Driver records the journey outcome");
    expect(card?.textContent).toContain("Actor: Driver");
    expect(card?.textContent).toContain("By: No recorded deadline");
  });
  it("shows the driver's departure window for a scheduled commitment",async()=>{
    fixture.bookings=[{...booking,trip_state:"scheduled"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/No journey statements recorded/)).closest("article");
    expect(card?.textContent).toContain("Next: Driver records departure and boarding");
    expect(card?.textContent).toContain("Actor: Driver");
    expect(card?.textContent).toContain("By: 3 Oct 2026, 5:30 pm IST");
  });
  it("shows explicit resolution for a delayed commitment",async()=>{
    fixture.bookings=[booking];
    render(<TripsPage/>);
    const card=(await screen.findByText(/No journey statements recorded/)).closest("article");
    expect(card?.textContent).toContain("Next: Resolve the delayed departure explicitly");
    expect(card?.textContent).toContain("Actor: Driver or operator");
    expect(card?.textContent).toContain("By: No automatic trip outcome");
  });
  it("does not assign a new trip action after a recorded cancellation",async()=>{
    fixture.bookings=[{...booking,status:"cancelled",trip_state:"cancelled"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Read recorded cancellation/)).closest("article");
    expect(card?.textContent).toContain("Actor: No action due");
    expect(card?.textContent).toContain("By: Cancellation recorded");
  });
  it("treats a cancelled passenger seat as cancelled even when the offer remains scheduled",async()=>{
    fixture.bookings=[{...booking,status:"cancelled",trip_state:"scheduled"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Read recorded cancellation/)).closest("article");
    expect(card?.textContent).toContain("cancelled");
    expect(card?.textContent).not.toContain("Driver records departure and boarding");
  });
  it("shows the contribution due after an operator resolves a journey review",async()=>{
    fixture.bookings=[{...booking,trip_state:"departed",journey_review_reason:"disagreement",
      obligation_paise:2500,obligation_due_at:"2026-10-04T12:05:00Z"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Open Contributions for the separate obligation/)).closest("article");
    expect(card?.textContent).toContain("Actor: Passenger");
    expect(card?.textContent).toContain("By: 4 Oct 2026, 5:35 pm IST");
  });
  it("shows a resolved no-debt review as a recorded decision",async()=>{
    fixture.bookings=[{...booking,trip_state:"departed",journey_review_reason:"disagreement"}];
    fixture.reviews=[{id:"review",allocation_id:"allocation",reason:"disagreement",status:"resolved",
      outcome:"did_not_travel",contribution_owed:false}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Read the recorded operator decision/)).closest("article");
    expect(card?.textContent).toContain("Actor: No action due");
    expect(card?.textContent).not.toContain("Operator reviews journey evidence");
    expect(card?.querySelector('a[href="/journey-reviews/review"]')).not.toBeNull();
  });
  it("shows the departure time for an operator-held commitment",async()=>{
    fixture.bookings=[{...booking,trip_state:"held"}];
    render(<TripsPage/>);
    const card=(await screen.findByText(/Operator review before departure/)).closest("article");
    expect(card?.textContent).toContain("Actor: Operator");
    expect(card?.textContent).toContain("By: 3 Oct 2026, 5:00 pm IST");
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
