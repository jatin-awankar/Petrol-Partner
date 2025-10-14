// import { createServerClient } from '@supabase/ssr';
// import { cookies } from 'next/headers';

// export const createClient = async () => {
//   const cookieStore = await cookies();

//   return createServerClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//     {
//       cookies: {
//         // ✅ New methods as per Supabase SSR v0.6.1
//         getAll: () => cookieStore.getAll(),
//         setAll: (cookiesToSet) => {
//           try {
//             for (const { name, value, options } of cookiesToSet) {
//               cookieStore.set(name, value, options);
//             }
//           } catch (err) {
//             console.warn('Error setting cookies:', err);
//           }
//         },
//       },
//     }
//   );
// };
