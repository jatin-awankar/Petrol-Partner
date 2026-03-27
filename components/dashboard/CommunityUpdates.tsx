"use client";

import React, { useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { ExternalLink } from "lucide-react";
import Icon from "../AppIcon";
import AppImage from "../AppImage";
import { motion } from "framer-motion";
import { useCommunityUpdates } from "@/hooks/community/useCommunityUpdates";
import { formatUtcToTodayOrDayMonth } from "@/lib/utils";

const CommunityUpdates: React.FC = () => {
  const { updates, loading, hasMore, loadMore } = useCommunityUpdates({ limit: 3 });
  const [commUpdates, setCommUpdates] = useState<typeof updates>([]);

  useEffect(() => {
    if (updates) setCommUpdates(updates);
  }, [updates]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-border rounded-xl p-6 mb-12 md:mb-6 shadow-soft"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Community Updates
        </h2>
        <Button variant="ghost" size="sm">
          <ExternalLink />
          View All
        </Button>
      </div>

      <div className="space-y-4">
        {loading && commUpdates.length === 0
          ? Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="border border-border rounded-lg overflow-hidden animate-pulse"
              >
                <div className="relative h-32 bg-gray-200"></div>
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
                className="border border-border rounded-lg overflow-hidden"
              >
                <div className="relative h-32 overflow-hidden">
                  <AppImage
                    src={update?.image_url ?? ""}
                    alt={update?.title ?? "Community Update"}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-medium text-foreground line-clamp-1">
                      {update?.title ?? "Untitled"}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {formatUtcToTodayOrDayMonth(update?.created_at) ?? "-"}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {update?.content ?? ""}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-blue-400/10 rounded-full flex items-center justify-center">
                        <Icon name="User" size={12} className="text-blue-400" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {update?.author ?? "Unknown"}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm">
                        <Icon
                          name="Heart"
                          size={14}
                          className="text-red-500 fill-current"
                        />
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

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={loadMore}
            disabled={loading}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default CommunityUpdates;
