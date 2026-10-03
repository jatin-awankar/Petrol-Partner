import Link from "next/link";
import { SupportNotice } from "@/components/support/SupportNotice";

export default function SupportPage() {
  return <div className="mx-auto max-w-3xl space-y-6 px-5 py-12 pb-28">
    <Link href="/" className="inline-flex min-h-11 items-center underline">Petrol Partner home</Link>
    <h1 className="text-3xl font-semibold">Help and support</h1>
    <SupportNotice />
  </div>;
}
