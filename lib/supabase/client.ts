import { createBrowserClient } from '@supabase/ssr'

// ✅ This is the browser-side (client component) Supabase client.
// Used for actions like inserting rides, updating profiles, etc.

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
