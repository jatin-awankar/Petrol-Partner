// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

// create the handler once
const handler = NextAuth(authOptions);

// export named method handlers required by Next.js App Router
export { handler as GET, handler as POST };
