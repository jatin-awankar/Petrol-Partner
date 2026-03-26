import { redirect } from "next/navigation";
import { Suspense } from "react";

import WelcomeCard from "@/components/dashboard/WelcomeCard";
import QuickActionCards from "@/components/dashboard/QuickActionCards";
import SafetyReminders from "@/components/dashboard/SafetyReminders";
import RecentActivitySection from "@/components/dashboard/RecentActivitySection";
import RideSuggestions from "@/components/dashboard/RideSuggestions";
import CommunityUpdates from "@/components/dashboard/CommunityUpdates";
import { frontendConfig } from "@/lib/frontend-config";
import { getServerCurrentUser } from "@/lib/server-auth";

export default async function DashboardPage() {
  const user = await getServerCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <WelcomeCard />
      <QuickActionCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SafetyReminders />
        <Suspense fallback={<div>Loading activities...</div>}>
          <RecentActivitySection />
        </Suspense>
      </div>
      <Suspense fallback={<div>Loading rides...</div>}>
        <RideSuggestions />
      </Suspense>
      {frontendConfig.flags.enableCommunityUi ? (
        <Suspense fallback={<div>Loading community updates...</div>}>
          <CommunityUpdates />
        </Suspense>
      ) : null}
    </div>
  );
}
