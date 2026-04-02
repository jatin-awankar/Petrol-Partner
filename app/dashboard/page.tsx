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
    <div className="min-h-screen pb-16 md:pb-0 bg-gradient-hero">
      <main className="page space-y-6">
        <WelcomeCard />

        <QuickActionCards />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <SafetyReminders />
          </div>
          <Suspense
            fallback={
              <div className="h-64 rounded-2xl border border-border/70 bg-card p-5">
                Loading recent bookings...
              </div>
            }
          >
            <RecentActivitySection />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <div className="h-64 rounded-2xl border border-border/70 bg-card p-5">
              Loading ride suggestions...
            </div>
          }
        >
          <RideSuggestions />
        </Suspense>

        {frontendConfig.flags.enableCommunityUi ? (
          <Suspense
            fallback={
              <div className="h-64 rounded-2xl border border-border/70 bg-card p-5">
                Loading community updates...
              </div>
            }
          >
            <CommunityUpdates />
          </Suspense>
        ) : null}
      </main>
    </div>
  );
}
