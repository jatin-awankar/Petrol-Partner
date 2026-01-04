// app/dashboard/page.tsx
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";

import React, { Suspense } from "react";
import WelcomeCard from "@/components/dashboard/WelcomeCard";
import QuickActionCards from "@/components/dashboard/QuickActionCards";
import StatsCard from "@/components/dashboard/StatsCard";
import SafetyReminders from "@/components/dashboard/SafetyReminders";
import RecentActivitySection from "@/components/dashboard/RecentActivitySection";
import RideSuggestions from "@/components/dashboard/RideSuggestions";
import CommunityUpdates from "@/components/dashboard/CommunityUpdates";

// 🚨 Important: remove "use client" (must be a server component)
export default async function DashboardPage() {
  // 1️⃣ Get the current user's session (server-side)
  const session = await getServerSession(authOptions);

  // 2️⃣ If no session, redirect to the loginpage
  if (!session) {
    redirect("/login");
  }

  // 3️⃣ Optionally use session.user data
  const userName = session.user?.name ?? "User";

  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <WelcomeCard />
      <QuickActionCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* <StatsCard /> */}
        <SafetyReminders />
        <Suspense fallback={<div>Loading activities...</div>}>
          <RecentActivitySection />
        </Suspense>
      </div>
      <Suspense fallback={<div>Loading rides...</div>}>
        <RideSuggestions />
      </Suspense>
      <Suspense fallback={<div>Loading community updates...</div>}>
        <CommunityUpdates />
      </Suspense>
    </div>
  );
}
