"use client";

import React from "react";

type SkeletonBlockProps = {
  className?: string;
};

const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = "" }) => (
  <div className={`animate-pulse rounded-md bg-muted/60 dark:bg-muted/40 ${className}`} />
);

type ChatRoomsListSkeletonProps = {
  rows?: number;
};

export const ChatRoomsListSkeleton: React.FC<ChatRoomsListSkeletonProps> = ({ rows = 7 }) => {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-3 w-56" />
              <SkeletonBlock className="h-3 w-48" />
            </div>
            <div className="shrink-0 space-y-1 text-right">
              <SkeletonBlock className="h-4 w-6 rounded-full" />
              <SkeletonBlock className="h-3 w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

type ChatHeaderSkeletonProps = {
  showBackButton?: boolean;
};

export const ChatHeaderSkeleton: React.FC<ChatHeaderSkeletonProps> = ({
  showBackButton = false,
}) => {
  return (
    <div className="absolute inset-x-0 top-0 z-20 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-start gap-3">
        {showBackButton ? <SkeletonBlock className="h-9 w-9 rounded-md md:hidden" /> : null}
        <div className="min-w-0 space-y-1">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-3 w-72" />
        </div>
      </div>
    </div>
  );
};

type ChatMessagesSkeletonProps = {
  bubbles?: number;
};

export const ChatMessagesSkeleton: React.FC<ChatMessagesSkeletonProps> = ({ bubbles = 6 }) => {
  return (
    <div className="space-y-3 mb-4 md:mb-10">
      {Array.from({ length: bubbles }).map((_, idx) => {
        const mine = idx % 2 === 0;
        return (
          <div key={idx} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] sm:max-w-[75%] space-y-1 ${mine ? "items-end" : "items-start"}`}>
              <SkeletonBlock className={`h-10 ${mine ? "w-56" : "w-64"} rounded-2xl`} />
              <SkeletonBlock className="h-2.5 w-14" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
