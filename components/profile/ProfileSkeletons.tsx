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

type ProfileSectionSkeletonProps = {
  icon?: React.ReactNode;
  titleWidthClass?: string;
};

export const ProfileSectionSkeleton: React.FC<ProfileSectionSkeletonProps> = ({
  icon,
  titleWidthClass = "w-40",
}) => {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
      <div className="flex w-full items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          {icon ?? <SkeletonBlock className="h-5 w-5 rounded-full" />}
          <SkeletonBlock className={`h-[18px] ${titleWidthClass}`} />
        </div>
        <SkeletonBlock className="h-[18px] w-[18px]" />
      </div>
    </section>
  );
};

export const ProfileHeaderSkeleton: React.FC = () => {
  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-card p-4 shadow-card sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <SkeletonBlock className="h-24 w-24 rounded-2xl" />
          <div className="min-w-0 space-y-2">
            <SkeletonBlock className="h-7 w-48" />
            <SkeletonBlock className="h-4 w-52" />
            <SkeletonBlock className="h-4 w-44" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-6 w-20 rounded-full" />
              <SkeletonBlock className="h-6 w-24 rounded-full" />
              <SkeletonBlock className="h-6 w-32 rounded-full" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-10 w-40 rounded-lg" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>
    </section>
  );
};

export const ProfileStatsStripSkeleton: React.FC = () => {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <article
          key={idx}
          className="rounded-xl border border-border/70 bg-card/95 px-4 py-3 shadow-card"
        >
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-4 w-4 rounded-full" />
          </div>
          <SkeletonBlock className="mt-2 h-5 w-24" />
        </article>
      ))}
    </section>
  );
};

type ProfileSettingsPageSkeletonProps = {
  sections?: number;
};

export const ProfileSettingsPageSkeleton: React.FC<
  ProfileSettingsPageSkeletonProps
> = ({ sections = 7 }) => {
  return (
    <div className="min-h-screen pb-16 md:pb-8 bg-gradient-hero">
      <div className="page mx-auto !max-w-5xl space-y-6">
        <ProfileHeaderSkeleton />
        <ProfileStatsStripSkeleton />

        <section className="profile-nav-scroll sticky top-16 z-20 overflow-x-auto rounded-xl border border-border/60 bg-background/90 px-3 py-2 shadow-sm backdrop-blur md:top-20">
          <div className="flex w-max min-w-full gap-2">
            {Array.from({ length: 7 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-8 w-20 rounded-full" />
            ))}
          </div>
        </section>

        <div className="space-y-4">
          {Array.from({ length: sections }).map((_, idx) => (
            <ProfileSectionSkeleton key={idx} />
          ))}
        </div>
      </div>
    </div>
  );
};
