"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import Link from "next/link";
import { motion } from "framer-motion";
import { useFetchRideOffers } from "@/hooks/rides/useRideOffers";
import { useFetchRideRequests } from "@/hooks/rides/useRideRequests";

const QuickActionCards: React.FC = () => {
  const [actions, setActions] = useState<Action[] | null>(null);
  const { offers, loading: loadingOffers } = useFetchRideOffers();
  const { requests, loading: loadingRequests } = useFetchRideRequests();

  useEffect(() => {
    setActions([
      {
        id: "find-ride",
        title: "Find a Ride",
        description: "Search for available rides",
        icon: "Search",
        color: "bg-success",
        textColor: "text-success-foreground",
        route: "/search-rides",
        stats: `${
          (offers?.totalCount ?? 0) + (requests?.totalCount ?? 0)
        } rides available`,
      },
      {
        id: "post-ride",
        title: "Offer/Request a Ride",
        description: "Share your journey",
        icon: "Bike",
        color: "bg-warning",
        textColor: "text-warning-foreground",
        route: "/post-a-ride",
        stats: "Earn ₹10-100 per ride",
      },
    ]);
  }, [offers?.totalCount, requests?.totalCount]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 "
    >
      {loadingOffers && loadingRequests
        ? Array.from({ length: 2 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-card border border-border rounded-xl p-6 animate-pulse"
            >
              <Skeleton width={48} height={48} className="mb-4" />
              <Skeleton width="70%" height={20} className="mb-2" />
              <Skeleton width="90%" height={14} className="mb-3" />
              <Skeleton width="50%" height={16} />
            </div>
          ))
        : actions?.map((action) => (
            <div
              key={action?.id ?? Math.random()}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-medium transition-shadow cursor-pointer shadow-card"
            >
              <Link href={action?.route}>
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`w-12 h-12 ${
                      action?.color ?? "bg-gray-300"
                    } rounded-lg flex items-center justify-center`}
                  >
                    {action?.icon ? (
                      <Icon name={action.icon} size={24} color="white" />
                    ) : (
                      <Skeleton width={24} height={24} />
                    )}
                  </div>
                  <Icon
                    name="ArrowRight"
                    size={20}
                    className="text-muted-foreground"
                  />
                </div>

                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {action?.title ?? <Skeleton width="60%" />}
                </h3>
                <p className="text-muted-foreground text-sm mb-3">
                  {action?.description ?? <Skeleton width="80%" />}
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {action?.stats ?? <Skeleton width={50} />}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    Get Started
                  </Button>
                </div>
              </Link>
            </div>
          ))}
    </motion.div>
  );
};

export default QuickActionCards;
