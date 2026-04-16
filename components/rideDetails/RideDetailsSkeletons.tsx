"use client";

import React from "react";
import { SkeletonBlock } from "@/components/searchRides/SearchRidesSkeletons";

export const RideDetailsPageSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen mb-28 bg-gradient-hero md:mb-auto">
      <main className="page mx-auto space-y-5 md:space-y-6">
        <section className="rounded-3xl border border-primary/20 bg-card/95 p-4 shadow-card md:p-6">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-2 h-7 w-72" />
          <div className="mt-3 flex gap-2">
            <SkeletonBlock className="h-6 w-20 rounded-full" />
            <SkeletonBlock className="h-6 w-16 rounded-full" />
            <SkeletonBlock className="h-6 w-24 rounded-full" />
          </div>
        </section>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 md:gap-6">
          <div className="space-y-5 lg:col-span-2 md:space-y-6">
            <SkeletonBlock className="h-72 w-full rounded-2xl" />
            <SkeletonBlock className="h-32 w-full rounded-2xl" />
            <SkeletonBlock className="h-64 w-full rounded-2xl" />
          </div>
          <aside className="space-y-6">
            <SkeletonBlock className="h-80 w-full rounded-2xl" />
            <SkeletonBlock className="h-56 w-full rounded-2xl" />
          </aside>
        </div>
      </main>
    </div>
  );
};
