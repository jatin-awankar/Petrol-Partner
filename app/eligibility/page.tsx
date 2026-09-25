"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

type Review = { status: string; enrolled_name: string | null; institution_name: string; graduation_year: number | null; adult_eligible: boolean | null; reviewed_at: string | null; metadata: { reviewReason?: string } } | null;
const categories = ["enrollment_letter", "student_card", "college_email", "other_enrollment"] as const;

export default function EligibilityPage() {
  const { user, loading } = useCurrentUser();
  const [review, setReview] = useState<Review>(null);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [admissionYear, setAdmissionYear] = useState(new Date().getFullYear());
  const [graduationYear, setGraduationYear] = useState(new Date().getFullYear() + 4);
  const [category, setCategory] = useState<(typeof categories)[number]>("enrollment_letter");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await apiRequest<{ student_verification: Review }>("/v1/verification/student");
    setReview(response.student_verification);
  }, []);
  useEffect(() => { if (user) void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load status")); }, [user, refresh]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (!file) throw new Error("Choose a synthetic sample file.");
      await apiRequest("/v1/verification/student", { method: "PUT", body: JSON.stringify({ provider: "manual_review", enrolled_name: name, institution_name: institution, admission_year: admissionYear, graduation_year: graduationYear, evidence_category: category }) });
      await apiRequest("/v1/verification/student/evidence", { method: "POST", headers: { "Content-Type": file.type, "X-Synthetic-Evidence": "true" }, body: file, skipJsonBody: true });
      setMessage("Synthetic evidence submitted for operator review.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Submission failed"); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="p-8">Checking account…</main>;
  if (!user) return <main className="p-8">Sign in to check eligibility. <Link href="/login">Sign in</Link></main>;
  return <main className="mx-auto max-w-2xl space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Student eligibility</h1>
    <p>Real evidence intake is not open. This form is for fabricated pilot rehearsal documents only.</p>
    <p role="status">{message}</p>
    <section className="rounded border p-4" aria-label="Eligibility status">
      <h2 className="font-semibold">Status: {review?.status ?? "not submitted"}</h2>
      {review && <p>{review.enrolled_name} · {review.institution_name} · graduation {review.graduation_year}</p>}
      {review?.reviewed_at && <p>Reviewed {new Date(review.reviewed_at).toLocaleString()}. Adult eligibility: {review.adult_eligible ? "confirmed" : "not confirmed"}.</p>}
      {review?.metadata?.reviewReason && <p>Reason: {review.metadata.reviewReason}</p>}
      {review?.status === "verified" && <p>Phone ownership and separate driver and car approvals are still required for applicable actions.</p>}
    </section>
    {(!review || review.status === "rejected" || review.status === "pending_review") && <form onSubmit={submit} className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Synthetic submission</h2>
      <label className="block">Enrolled name<input className="block w-full border p-2" required minLength={2} maxLength={150} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block">Institution<input className="block w-full border p-2" required minLength={2} maxLength={255} value={institution} onChange={(event) => setInstitution(event.target.value)} /></label>
      <label className="block">Admission year<input className="block w-full border p-2" type="number" min={2000} max={2100} value={admissionYear} onChange={(event) => setAdmissionYear(Number(event.target.value))} /></label>
      <label className="block">Graduation year<input className="block w-full border p-2" type="number" min={2000} max={2100} value={graduationYear} onChange={(event) => setGraduationYear(Number(event.target.value))} /></label>
      <label className="block">Evidence category<select className="block w-full border p-2" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{categories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label className="block">Fabricated sample document (JPEG, PNG or PDF; 512 KB maximum)<input className="block w-full" type="file" accept="image/jpeg,image/png,application/pdf" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button className="rounded bg-black px-4 py-2 text-white" disabled={busy}>{busy ? "Submitting…" : "Submit synthetic evidence"}</button>
    </form>}
  </main>;
}
