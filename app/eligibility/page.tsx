"use client";

import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {apiRequest} from "@/lib/api/client";
import {useCurrentUser} from "@/hooks/auth/useCurrentUser";

type Review={status:string;enrolled_name:string|null;institution_name:string;graduation_year:number|null;
  adult_eligible:boolean|null;reviewed_at:string|null;metadata:{reviewReason?:string}}|null;
type Restriction={id:string;action:"restrict"|"reverse";scope:string;reason:string;
  recorded_at:string;reverses_id:string|null};

export default function EligibilityPage(){
  const {user,loading:authLoading}=useCurrentUser();
  const [review,setReview]=useState<Review>(null);
  const [restrictions,setRestrictions]=useState<Restriction[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [student,history]=await Promise.all([
        apiRequest<{student_verification:Review}>("/v1/verification/student"),
        apiRequest<{history:Restriction[]}>("/v1/verification/account-restrictions"),
      ]);
      setReview(student.student_verification);setRestrictions(history.history);
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to load historical records.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{if(user)void refresh();},[user,refresh]);
  if(authLoading)return <main className="mx-auto max-w-2xl p-8" role="status">Checking account…</main>;
  if(!user)return <main className="mx-auto max-w-2xl p-8">Sign in to view your records. <Link href="/login" className="underline">Sign in</Link></main>;
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-8">
    <Link href="/dashboard" className="inline-flex min-h-11 items-center underline">← Home</Link>
    <div><h1 className="text-3xl font-semibold">Historical corridor records</h1>
      <p className="mt-2 text-muted-foreground">This page preserves records from the former corridor pilot. Student, driver, and car approvals shown here do not grant eligibility under the new route policy. Real bookings remain disabled.</p></div>
    <p>For the broader route policy, <Link href="/adult-declaration" className="underline">view your adult self-declaration</Link>. College enrollment and age documents are not required for that declaration.</p>
    {loading?<p role="status">Loading historical records…</p>:error?<div role="alert" className="rounded-xl border p-4">{error} <button type="button" className="min-h-11 underline" onClick={()=>void refresh()}>Try again</button></div>:<>
      <section className="rounded-xl border p-5" aria-label="Historical student review">
        <h2 className="text-xl font-semibold">Former student review</h2>
        <p className="mt-2">Status: {review?.status??"not submitted"}</p>
        {review&&<p>{review.enrolled_name} · {review.institution_name} · graduation {review.graduation_year}</p>}
        {review?.reviewed_at&&<p>Reviewed {new Date(review.reviewed_at).toLocaleString()}. Former adult review: {review.adult_eligible?"confirmed":"not confirmed"}.</p>}
        {review?.metadata?.reviewReason&&<p>Reason: {review.metadata.reviewReason}</p>}
        {review?.status==="verified"&&<p>Under the former corridor policy, driver and car approvals were separate.</p>}
      </section>
      <section id="travel-restrictions" className="space-y-2 rounded-xl border p-5" aria-label="Travel restrictions">
        <h2 className="text-xl font-semibold">Travel restriction history</h2>
        {restrictions.length?restrictions.map(item=><p key={item.id}>
          {item.action==="restrict"?(restrictions.some(next=>next.reverses_id===item.id)?"Reversed restriction":"Active restriction"):"Reversal"} · {item.scope} · {new Date(item.recorded_at).toLocaleString()} · {item.reason}
        </p>):<p>No travel restrictions recorded.</p>}
      </section>
    </>}
  </main>;
}
