// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { NextApiHandler } from "next";
import { authOptions } from "@/lib/authOptions";

// create the handler once
const handler = NextAuth(authOptions);

// export named method handlers required by Next.js App Router
export { handler as GET, handler as POST };




// // Example React hook that gets token from /api/auth/token and uses API
// import { useSession } from "next-auth/react";

// export async function getApiToken() {
//   const res = await fetch("/api/auth/token", { credentials: "include" });
//   if (!res.ok) throw new Error("Not signed in");
//   const json = await res.json();
//   return json.token;
// }

// // Example call
// async function createBooking(bookingPayload) {
//   const token = await getApiToken();
//   const r = await fetch("https://api.your-express.app/api/rides/123/requests", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${token}`,
//       "Idempotency-Key": "uuid-v4"
//     },
//     body: JSON.stringify(bookingPayload)
//   });
//   return r.json();
// }
