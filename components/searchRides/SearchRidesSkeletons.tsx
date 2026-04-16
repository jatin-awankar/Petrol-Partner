"use client";

import React from "react";

type SkeletonBlockProps = {
  className?: string;
};

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  className = "",
}) => (
  <div
    className={`animate-pulse rounded-md bg-muted/60 dark:bg-muted/40 ${className}`}
  />
);

type RideCardSkeletonProps = {
  compact?: boolean;
};

export const RideCardSkeleton: React.FC<RideCardSkeletonProps> = ({
  compact = false,
}) => {
  return (
    <div className="rounded-xl border border-border/70 bg-card/90 p-4 shadow-soft">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <SkeletonBlock className="h-12 w-12 rounded-xl" />
            <div className="space-y-1.5">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-3 w-36" />
            </div>
          </div>
          <SkeletonBlock className="h-5 w-14 rounded-full" />
        </div>

        <SkeletonBlock className="h-20 w-full rounded-xl" />

        {!compact ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SkeletonBlock className="h-11 w-full rounded-lg" />
              <SkeletonBlock className="h-11 w-full rounded-lg" />
              <SkeletonBlock className="h-11 w-full rounded-lg" />
            </div>
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-6 w-20" />
              <SkeletonBlock className="h-8 w-24 rounded-lg" />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

type RideResultsGridSkeletonProps = {
  cards?: number;
  compact?: boolean;
};

export const RideResultsGridSkeleton: React.FC<RideResultsGridSkeletonProps> = ({
  cards = 6,
  compact = false,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, idx) => (
        <RideCardSkeleton key={idx} compact={compact} />
      ))}
    </div>
  );
};

export const SearchFiltersSkeleton: React.FC = () => {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card md:p-5">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-muted/25 to-card p-4 md:p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <SkeletonBlock className="h-10 w-full lg:col-span-4" />
          <SkeletonBlock className="h-10 w-full lg:col-span-4" />
          <SkeletonBlock className="h-10 w-full lg:col-span-4" />
          <SkeletonBlock className="h-10 w-full lg:col-span-3" />
          <SkeletonBlock className="h-10 w-full lg:col-span-3" />
          <div className="flex gap-2 lg:col-span-6">
            <SkeletonBlock className="h-10 w-28" />
            <SkeletonBlock className="h-10 w-28" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SkeletonBlock className="h-10 w-full md:w-[360px]" />
        <SkeletonBlock className="h-7 w-32 rounded-full" />
      </div>

      <div className="mt-4">
        <RideResultsGridSkeleton cards={6} />
      </div>
    </section>
  );
};

export const NearbyRidesSkeleton: React.FC = () => {
  return (
    <section className="rounded-3xl border border-sky-300/25 bg-gradient-to-br from-sky-100/30 via-card to-card p-4 shadow-card dark:from-sky-500/10 md:p-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-3 w-52" />
        </div>
        <SkeletonBlock className="h-10 w-36 rounded-lg" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-4">
          <SkeletonBlock className="mb-3 h-4 w-28" />
          <RideResultsGridSkeleton cards={2} compact />
        </div>
        <div className="rounded-2xl border border-warning/25 bg-gradient-to-br from-warning/5 via-card to-card p-4">
          <SkeletonBlock className="mb-3 h-4 w-32" />
          <RideResultsGridSkeleton cards={2} compact />
        </div>
      </div>
    </section>
  );
};

export const SuggestedRidesSkeleton: React.FC = () => {
  return (
    <section className="h-full rounded-3xl border border-warning/25 bg-gradient-to-br from-warning/10 via-card to-card p-4 shadow-card md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-3 w-40" />
        </div>
        <SkeletonBlock className="h-8 w-20 rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <RideCardSkeleton key={idx} compact />
        ))}
      </div>
    </section>
  );
};

export const SearchRidesPageSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-hero pb-16 md:pb-0">
      <div className="page container mx-auto space-y-6">
        <section className="rounded-3xl border border-primary/20 bg-card/95 p-5 shadow-card md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-8 w-64" />
              <SkeletonBlock className="h-4 w-80" />
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-10 w-24 rounded-lg" />
              <SkeletonBlock className="h-10 w-28 rounded-lg" />
            </div>
          </div>
        </section>

        <SearchFiltersSkeleton />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <NearbyRidesSkeleton />
          </div>
          <div className="xl:col-span-2">
            <SuggestedRidesSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
};
