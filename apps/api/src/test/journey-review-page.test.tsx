// @vitest-environment jsdom
import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Page from "../../../../app/journey-reviews/[id]/page";
const state=vi.hoisted(()=>({error:false,calls:[] as string[]}));
vi.mock("next/navigation",()=>({useParams:()=>({id:"review-id"})}));
vi.mock("@/lib/api/client",()=>({apiRequest:async(path:string)=>{state.calls.push(path);
  if(state.error)throw new Error("Read unavailable");
  return {case:{id:"review-id",offer_id:"offer-id",review_reason:"passenger_silence",status:"open",
    frozen_paise:2500,currency:"INR",driver_travelled:true,driver_completed:true,
    passenger_travelled:null,passenger_completed:null,obligation_paise:null,obligation_due_at:null},
    decisions:[]};}}));
afterEach(()=>{cleanup();state.error=false;state.calls=[];});
it("does not turn driver statement or passenger silence into an obligation",async()=>{
  render(<Page/>);
  expect(await screen.findByText(/No operator decision is recorded/)).not.toBeNull();
  expect(screen.getByText(/No contribution obligation is recorded/)).not.toBeNull();
  expect(screen.getByText(/No statement recorded/)).not.toBeNull();
  expect(state.calls).toEqual(["/v1/seat-requests/journey-reviews/review-id"]);
});
it("shows a retryable read error",async()=>{state.error=true;render(<Page/>);
  expect(await screen.findByRole("alert")).not.toBeNull();
  expect(screen.getByRole("button",{name:"Retry read"})).not.toBeNull();
});
