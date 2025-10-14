// // src/app/providers.tsx
// 'use client';

// import React from 'react';
// import { ClerkProvider, useUser } from '@clerk/nextjs';
// import { createContext, useContext, useEffect, useState } from 'react';
// import { supabase } from '../lib/supabase';

// type UserProfile = {
//   // Define the expected shape of the user profile here, for example:
//   id: string;
//   name: string;
//   email: string;
//   // Add other fields as needed
// } | null;

// type AuthContextType = {
//   clerkId: string | null;
//   profile: UserProfile;
//   refreshProfile: () => Promise<void>;
// };

// const AuthContext = createContext<AuthContextType | null>(null);

// export const useAuth = () => {
//   const ctx = useContext(AuthContext);
//   if (!ctx) throw new Error('useAuth must be used within AuthProvider');
//   return ctx;
// };

// export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
//   const { user } = useUser();
//   const [profile, setProfile] = useState<UserProfile>(null);

//   const clerkId = user?.id ?? null;

//   const refreshProfile = async () => {
//     if (!clerkId) return;
//     const { data } = await supabase
//       .from('user_profiles')
//       .select('*')
//       .eq('clerk_id', clerkId)
//       .single();
//     setProfile(data);
//   };

//   useEffect(() => {
//     if (clerkId) refreshProfile();
//     else setProfile(null);
//   }, [clerkId]);

//   return (
//     <AuthContext.Provider value={{ clerkId, profile, refreshProfile }}>
//       {children}
//     </AuthContext.Provider>
//   );
// };

// export const Providers = ({ children }: { children: React.ReactNode }) => (
//   <ClerkProvider>
//     <AuthProvider>{children}</AuthProvider>
//   </ClerkProvider>
// );
