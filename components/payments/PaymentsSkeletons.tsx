"use client";

import React from "react";

type SkeletonBlockProps = {
  className?: string;
};

const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = "" }) => (
  <div className={`animate-pulse rounded-md bg-muted/60 dark:bg-muted/40 ${className}`} />
);

type PaymentsSummarySkeletonProps = {
  cards?: number;
};

export const PaymentsSummarySkeleton: React.FC<PaymentsSummarySkeletonProps> = ({
  cards = 4,
}) => {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cards }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-border/70 bg-card/90 px-4 py-4 shadow-card"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-7 w-24" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="size-4 rounded-full" />
          </div>
        </div>
      ))}
    </section>
  );
};

export const PaymentsFilterSkeleton: React.FC = () => {
  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-9 w-24 rounded-lg" />
          ))}
        </div>
        <SkeletonBlock className="h-9 w-28 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <SkeletonBlock className="h-9 w-full rounded-lg" />
        <SkeletonBlock className="h-9 w-full rounded-lg md:w-56" />
      </div>
    </section>
  );
};

type PaymentBookingCardSkeletonProps = {
  compact?: boolean;
};

export const PaymentBookingCardSkeleton: React.FC<PaymentBookingCardSkeletonProps> = ({
  compact = false,
}) => {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-52" />
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-4 w-48" />
        </div>
        <div className="space-y-2 md:text-right">
          <SkeletonBlock className="h-6 w-24 md:ml-auto" />
          <SkeletonBlock className="h-5 w-28 md:ml-auto" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border border-border/70 bg-muted/30 p-3">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-2 h-4 w-24" />
          </div>
        ))}
      </div>

      {!compact ? (
        <>
          <SkeletonBlock className="mt-4 h-10 w-full rounded-xl" />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3">
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
            <SkeletonBlock className="h-9 w-32 rounded-lg" />
            <SkeletonBlock className="ml-auto h-9 w-24 rounded-lg" />
          </div>
        </>
      ) : null}
    </article>
  );
};

type PaymentsListSkeletonProps = {
  rows?: number;
  compact?: boolean;
};

export const PaymentsListSkeleton: React.FC<PaymentsListSkeletonProps> = ({
  rows = 4,
  compact = false,
}) => {
  return (
    <section className="space-y-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <PaymentBookingCardSkeleton key={idx} compact={compact} />
      ))}
    </section>
  );
};
