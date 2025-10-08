// import { supabase } from "@/lib/supabase";
// import { verifyToken } from "@/lib/auth";
// import { cookies } from "next/headers";
import React, { Suspense } from "react";
import WelcomeCard from "@/components/dashboard/WelcomeCard";
import QuickActionCards from "@/components/dashboard/QuickActionCards";
import StatsCard from "@/components/dashboard/StatsCard";
import SafetyReminders from "@/components/dashboard/SafetyReminders";
import RecentActivitySection from "@/components/dashboard/RecentActivitySection";
import RideSuggestions from "@/components/dashboard/RideSuggestions";
import CommunityUpdates from "@/components/dashboard/CommunityUpdates";

export default async function DashboardPage() {
  // const token = (await cookies()).get("token")?.value;
  // const decoded = token ? verifyToken(token) : null;

  // if (!decoded) {
  //   return (
  //     <div className="text-center mt-20">
  //       <p>Please log in to access your dashboard.</p>
  //     </div>
  //   );
  // }

  // const { data: profile } = await supabase
  //   .from("user_profiles")
  //   .select("full_name, college, is_verified")
  //   .eq("id", decoded.id)
  //   .single();

  const profile = {
    full_name: "",
    college: "",
    is_verified: false
  };

  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <WelcomeCard
        userName={profile?.full_name || "Student"}
        collegeName={profile?.college || "Your College"}
        isVerified={profile?.is_verified || false}
      />
      <QuickActionCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatsCard />
        <SafetyReminders />
      </div>
      {/* <Suspense fallback={<div>Loading activities...</div>}> */}
        <RecentActivitySection />
      {/* </Suspense> */}
      {/* // <Suspense fallback={<div>Loading rides...</div>}> */}
        <RideSuggestions />
      {/* // </Suspense> */}
      {/* <Suspense fallback={<div>Loading community updates...</div>}> */}
        <CommunityUpdates />
      {/* </Suspense> */}
    </div>
  );
}
