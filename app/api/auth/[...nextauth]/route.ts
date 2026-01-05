// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Create the handler once (singleton pattern for better performance)
const handler = NextAuth(authOptions);

// Export named method handlers required by Next.js App Router
export { handler as GET, handler as POST };
