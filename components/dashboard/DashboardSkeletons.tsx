"use client";

import React from "react";

type SkeletonBlockProps = {
  className?: string;
};

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = "" }) => {
  return <div className={`animate-pulse rounded-md bg-muted/60 dark:bg-muted/40 ${className}`} />;
};

type DashboardSectionSkeletonProps = {
  titleWidthClass?: string;
  rows?: number;
  rowHeightClass?: string;
  className?: string;
};

export const DashboardSectionSkeleton: React.FC<DashboardSectionSkeletonProps> = ({
  titleWidthClass = "w-48",
  rows = 3,
  rowHeightClass = "h-20",
  className = "",
}) => {
  return (
    <section className={`rounded-2xl border border-border/70 bg-card p-5 shadow-card ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-7 w-7 rounded-md" />
          <SkeletonBlock className={`h-5 ${titleWidthClass}`} />
        </div>
        <SkeletonBlock className="h-8 w-20 rounded-md" />
      </div>

      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <SkeletonBlock key={idx} className={`${rowHeightClass} rounded-xl`} />
        ))}
      </div>
    </section>
  );
};

type DashboardGridSkeletonProps = {
  cards?: number;
  cardHeightClass?: string;
  className?: string;
};

export const DashboardGridSkeleton: React.FC<DashboardGridSkeletonProps> = ({
  cards = 4,
  cardHeightClass = "h-36",
  className = "",
}) => {
  return (
    <div className={`grid gap-3 md:grid-cols-2 ${className}`}>
      {Array.from({ length: cards }).map((_, idx) => (
        <SkeletonBlock key={idx} className={`${cardHeightClass} rounded-xl border border-border/70`} />
      ))}
    </div>
  );
};
