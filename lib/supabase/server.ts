// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

export const createSupabaseServerClient = async () => {
  const { getToken } = await auth();

  const token = await getToken({ template: "supabase" });

  if (!token) throw new Error("No Clerk JWT found");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
};
