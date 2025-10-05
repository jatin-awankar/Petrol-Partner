"use client";

// import { useAuth } from "@clerk/nextjs";
// import { redirect, useRouter } from "next/navigation";
// import { useEffect } from "react";

import DashboardStats from "@/components/dashboard/DashboardStats";
import ActiveRide from "@/components/ActiveRide";
// import MapComponent from "@/components/dashboard/Map";
// import DisplayAllRides from "@/components/dashboard/DisplayAllRides";
import WelcomeCard from "@/components/dashboard/WelcomeCard";
import QuickActionCards from "@/components/dashboard/QuickActionCards";
import RecentActivitySection from "@/components/dashboard/RecentActivitySection";
import RideSuggestions from "@/components/dashboard/RideSuggestions";
import CommunityUpdates from "@/components/dashboard/CommunityUpdates";

const Page = () => {
  // const { isLoaded, isSignedIn, userId } = useAuth();
  // const router = useRouter();

  // if (!userId) {
  //   redirect("/");
  // }

  // useEffect(() => {
  //   if (isLoaded && !isSignedIn) {
  //     router.replace("/"); // home page
  //   } else {
  //     // Sync user with Supabase
  //     fetch("/api/sync-user", { method: "POST" }).catch(console.error);
  //   }
  // }, [isLoaded, isSignedIn, router]);

  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6 lg:grid lg:grid-cols-12 lg:gap-8">
      {/* Desktop Layout */}
      {/* Left Sidebar - Quick Actions (Desktop) */}
      <div className="hidden lg:block lg:col-span-3">
        <div className="sticky top-20">
          <QuickActionCards />
          <ActiveRide />
          {/* <SafetyReminders /> */}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-6">
        {/* Welcome Card */}
        <WelcomeCard />

        {/* Quick Actions (Mobile) */}
        <div className="lg:hidden">
          <QuickActionCards />
          <ActiveRide />
        </div>

        {/* Recent Activity */}
        <RecentActivitySection />

        {/* Ride Suggestions */}
        <RideSuggestions />

        {/* Community Updates */}
        <CommunityUpdates />

        {/* Safety Reminders (Mobile) */}
        <div className="lg:hidden">{/* <SafetyReminders /> */}</div>
      </div>

      {/* Right Sidebar - Stats & Info (Desktop) */}
      <div className="hidden lg:block lg:col-span-3">
        <div className="sticky top-20">
          <DashboardStats />

          {/* Additional Info Card */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Quick Tips
            </h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>💡 Book rides 30 minutes in advance for better matches</p>
              <p>🌱 Choose eco-friendly rides to earn green points</p>
              <p>⭐ Rate your rides to help the community</p>
              <p>🔒 Always verify driver details before boarding</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card (Mobile) */}
      <div className="lg:hidden">
        <DashboardStats />
      </div>
    </div>
  );
};

export default Page;

// <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
//   <DashboardStats />
//   <ActiveRide />
//   <MapComponent className="h-64" />
//   <DisplayAllRides />
// </div>
