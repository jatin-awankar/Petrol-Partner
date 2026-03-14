"use client";

import React, { useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

import { Button } from "../ui/button";
import Icon from "../AppIcon";
import { useCommunityUpdates } from "@/hooks/community/useCommunityUpdates";
import { formatUtcToTodayOrDayMonth } from "@/lib/utils";

const normalizeImageUrl = (url?: string | null) => {
  if (!url) return "/assets/images/no_image.png";

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com" && parsed.pathname.includes("/blob/")) {
      const rawPath = parsed.pathname.replace("/blob/", "/");
      return `https://raw.githubusercontent.com${rawPath}`;
    }
    return url;
  } catch {
    return "/assets/images/no_image.png";
  }
};

const CommunityUpdates: React.FC = () => {
  const { updates, loading, hasMore, loadMore } = useCommunityUpdates({
    limit: 3,
  });
  const [commUpdates, setCommUpdates] = useState<typeof updates>([]);

  useEffect(() => {
    if (updates) setCommUpdates(updates);
  }, [updates]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-soft mb-12"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Community updates
          </h2>
          <p className="text-xs text-muted-foreground">
            Campus notices and ride-sharing tips
          </p>
        </div>
        {/* <Button variant="ghost" size="sm">
          <ExternalLink />
          View all
        </Button> */}
      </div>

      <div className="space-y-4">
        {loading && commUpdates.length === 0
          ? Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border overflow-hidden animate-pulse"
              >
                <div className="relative h-32 bg-muted"></div>
                <div className="p-4 space-y-2">
                  <Skeleton width="70%" height={16} />
                  <Skeleton width="90%" height={12} />
                  <Skeleton width="80%" height={12} />
                  <Skeleton width="40%" height={12} />
                </div>
              </div>
            ))
          : commUpdates?.map((update) => (
              <div
                key={update?.id}
                className="rounded-xl border border-border overflow-hidden bg-background/60"
              >
                <div className="relative h-32 overflow-hidden">
                  <Image
                    src={normalizeImageUrl(update?.image_url)}
                    alt={update?.title ?? "Community Update"}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    quality={95}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">
                      {update?.title ?? "Untitled"}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatUtcToTodayOrDayMonth(update?.created_at) ?? "-"}
                    </span>
                  </div>

                  <p className="mb-3 text-xs text-muted-foreground line-clamp-2">
                    {update?.content ?? ""}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                        <Icon name="User" size={12} className="text-primary" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {update?.author ?? "Unknown"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Icon name="Heart" size={14} className="text-error" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Icon name="Share2" size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </motion.section>
  );
};

export default CommunityUpdates;
