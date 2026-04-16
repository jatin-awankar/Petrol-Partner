"use client";

import React from "react";

type SkeletonBlockProps = {
  className?: string;
};

const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = "" }) => (
  <div className={`animate-pulse rounded-md bg-muted/60 dark:bg-muted/40 ${className}`} />
);

type VehicleSectionSkeletonProps = {
  rows?: number;
};

export const VehicleSectionSkeleton: React.FC<VehicleSectionSkeletonProps> = ({
  rows = 4,
}) => {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 md:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-52" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <SkeletonBlock className="h-6 w-24" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-border/70 bg-background/80 p-4"
          >
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-5 w-16" />
            </div>
            <SkeletonBlock className="mt-3 h-3 w-32" />
            <SkeletonBlock className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="flex justify-stretch sm:justify-end">
        <SkeletonBlock className="h-9 w-full sm:w-52 rounded-lg" />
      </div>
    </div>
  );
};

type PostRidePageSkeletonProps = {
  steps?: number;
  sidebarCards?: number;
};

export const PostRidePageSkeleton: React.FC<PostRidePageSkeletonProps> = ({
  steps = 6,
  sidebarCards = 3,
}) => {
  return (
    <div className="min-h-screen mb-16 md:mb-auto bg-gradient-hero">
      <div className="page container mx-auto px-3 py-4 sm:px-4 md:py-8">
        <div className="flex flex-col gap-4 md:gap-6">
          <header className="rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-card">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="h-8 w-52" />
                <SkeletonBlock className="h-4 w-72" />
              </div>
              <SkeletonBlock className="h-11 w-full sm:w-60 rounded-lg" />
            </div>
          </header>

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 md:gap-6">
            <aside className="space-y-4">
              {Array.from({ length: sidebarCards }).map((_, idx) => (
                <section
                  key={idx}
                  className="rounded-xl border border-border/70 bg-card/95 p-4 shadow-card"
                >
                  <SkeletonBlock className="h-5 w-40" />
                  <div className="mt-3 space-y-2">
                    <SkeletonBlock className="h-4 w-full" />
                    <SkeletonBlock className="h-4 w-4/5" />
                    <SkeletonBlock className="h-4 w-3/5" />
                  </div>
                </section>
              ))}
            </aside>

            <section className="rounded-2xl border border-border/70 bg-card/95 backdrop-blur-sm shadow-card">
              <div className="border-b border-border/70 px-4 py-4 sm:px-5 md:px-6">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-2 h-6 w-36" />
                <SkeletonBlock className="mt-2 h-4 w-48" />
              </div>

              <div className="space-y-4 p-3 sm:p-4 md:p-6">
                {Array.from({ length: Math.max(3, Math.min(steps, 5)) }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-12 w-full rounded-lg" />
                ))}
              </div>

              <div className="border-t border-border/70 px-3 py-4 sm:px-4 md:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <SkeletonBlock className="h-10 w-full sm:w-28 rounded-lg" />
                  <div className="grid grid-cols-1 sm:flex gap-2 w-full sm:w-auto">
                    <SkeletonBlock className="h-10 w-full sm:w-28 rounded-lg" />
                    <SkeletonBlock className="h-10 w-full sm:w-24 rounded-lg" />
                    <SkeletonBlock className="h-10 w-full sm:w-24 rounded-lg" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
