import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { authOptions } from "@/lib/authOptions";
import WelcomeCard from "@/components/dashboard/WelcomeCard";
import QuickActionCards from "@/components/dashboard/QuickActionCards";
import RideSuggestions from "@/components/dashboard/RideSuggestions";
import RecentActivitySection from "@/components/dashboard/RecentActivitySection";
import SafetyReminders from "@/components/dashboard/SafetyReminders";
import CommunityUpdates from "@/components/dashboard/CommunityUpdates";

const LoadingCard = ({ label }: { label: string }) => (
  <div className="rounded-xl border border-border bg-card p-5 shadow-card">
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="page min-h-screen bg-background pb-20 md:pb-6 space-y-5">
      <WelcomeCard />

      <QuickActionCards />

      <Suspense fallback={<LoadingCard label="Loading suggested rides..." />}>
        <RideSuggestions />
      </Suspense>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Suspense fallback={<LoadingCard label="Loading recent activity..." />}>
          <RecentActivitySection />
        </Suspense>

        <SafetyReminders />
      </div>

      <Suspense fallback={<LoadingCard label="Loading community updates..." />}>
        <CommunityUpdates />
      </Suspense>
    </main>
  );
}
