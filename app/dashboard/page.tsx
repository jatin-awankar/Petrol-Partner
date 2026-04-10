import { redirect } from "next/navigation";
import { Suspense } from "react";

import WelcomeCard from "@/components/dashboard/WelcomeCard";
import QuickActionCards from "@/components/dashboard/QuickActionCards";
import SafetyReminders from "@/components/dashboard/SafetyReminders";
import RecentActivitySection from "@/components/dashboard/RecentActivitySection";
import RideSuggestions from "@/components/dashboard/RideSuggestions";
import CommunityUpdates from "@/components/dashboard/CommunityUpdates";
import {
  DashboardGridSkeleton,
  DashboardSectionSkeleton,
} from "@/components/dashboard/DashboardSkeletons";
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
              <DashboardSectionSkeleton
                titleWidthClass="w-40"
                rows={4}
                rowHeightClass="h-20"
              />
            }
          >
            <RecentActivitySection />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 animate-pulse rounded-md bg-muted/60 dark:bg-muted/40" />
                  <div className="h-5 w-44 animate-pulse rounded-md bg-muted/60 dark:bg-muted/40" />
                </div>
                <div className="h-8 w-20 animate-pulse rounded-md bg-muted/60 dark:bg-muted/40" />
              </div>
              <div className="mt-4">
                <DashboardGridSkeleton cards={4} />
              </div>
            </section>
          }
        >
          <RideSuggestions />
        </Suspense>

        {frontendConfig.flags.enableCommunityUi ? (
          <Suspense
            fallback={
              <DashboardSectionSkeleton
                titleWidthClass="w-40"
                rows={3}
                rowHeightClass="h-52"
              />
            }
          >
            <CommunityUpdates />
          </Suspense>
        ) : null}
      </main>
    </div>
  );
}
