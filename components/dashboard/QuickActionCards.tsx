"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import { motion } from "framer-motion";

import { Button } from "../ui/button";
import Icon from "../AppIcon";
import { useFetchRideOffers } from "@/hooks/rides/useRideOffers";
import { useFetchRideRequests } from "@/hooks/rides/useRideRequests";

const QuickActionCards: React.FC = () => {
  const [actions, setActions] = useState<Action[] | null>(null);
  const { offers } = useFetchRideOffers();
  const { requests } = useFetchRideRequests();

  const totalRides = useMemo(
    () => (offers?.totalCount ?? 0) + (requests?.totalCount ?? 0),
    [offers?.totalCount, requests?.totalCount]
  );

  useEffect(() => {
    setActions([
      {
        id: "find-ride",
        title: "Find a Ride",
        description: "Browse campus routes and reserve a seat",
        icon: "Search",
        color: "bg-primary/10",
        textColor: "text-primary",
        route: "/search-rides",
        stats: `${totalRides} rides near you`,
      },
      {
        id: "post-ride",
        title: "Offer a Ride",
        description: "Post your commute and open seats",
        icon: "CarFront",
        color: "bg-accent/70",
        textColor: "text-accent-foreground",
        route: "/post-a-ride",
        stats: "Set your own per-seat fare",
      },
    ]);
  }, [totalRides]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      {actions?.map((action) => (
        <Link
          key={action?.id}
          href={action?.route}
          className="group rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                  action?.color ?? "bg-muted"
                }`}
              >
                {action?.icon ? (
                  <Icon name={action.icon} size={22} className={action.textColor} />
                ) : (
                  <Skeleton width={22} height={22} />
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {action?.title ?? <Skeleton width="60%" />}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {action?.description ?? <Skeleton width="80%" />}
                </p>
              </div>
            </div>

            <Icon
              name="ArrowUpRight"
              size={18}
              className="text-muted-foreground transition group-hover:text-primary"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {action?.stats ?? <Skeleton width="50%" />}
            </span>
            <Button variant="ghost" size="sm">
              Get Started
            </Button>
          </div>
        </Link>
      ))}
    </motion.section>
  );
};

export default QuickActionCards;
