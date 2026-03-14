"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

import { Button } from "../ui/button";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import { useRouter } from "next/navigation";
import { formatTimeToAmPm, todaysDate } from "@/lib/utils";

const RideSuggestions: React.FC = () => {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<CombineRideData[] | null>(
    null,
  );
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>(
    [],
  );

  const { rideOffers, rideRequests, loading } = useFetchSuggestedRides({
    limit: 2,
    date: todaysDate.toISOString(),
  });

  useEffect(() => {
    const offers =
      rideOffers && Array.isArray(rideOffers.rides) ? rideOffers.rides : [];
    const requests =
      rideRequests && Array.isArray(rideRequests.rides)
        ? rideRequests.rides
        : [];
    setSuggestions([...offers, ...requests]);
  }, [rideOffers, rideRequests]);

  const dismissSuggestion = (suggestionId: string) => {
    setDismissedSuggestions((prev) => [...prev, suggestionId]);
  };

  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  const visibleSuggestions = useMemo(
    () => suggestions?.filter((s) => !dismissedSuggestions.includes(s.id)),
    [dismissedSuggestions, suggestions],
  );

  if (!loading && (!visibleSuggestions || visibleSuggestions.length === 0)) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-soft"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="Zap" size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Suggested rides
            </h2>
            <p className="text-xs text-muted-foreground">
              Based on your recent routes
            </p>
          </div>
        </div>
        <p className="px-2">Customize</p>
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 2 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border p-4 animate-pulse"
              >
                <Skeleton width="100%" height={16} className="mb-2" />
                <Skeleton width="80%" height={12} className="mb-2" />
                <Skeleton width="90%" height={12} className="mb-2" />
                <Skeleton width="100%" height={20} />
              </div>
            ))
          : visibleSuggestions?.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-xl border border-border bg-background/60 p-4 transition hover:shadow-soft cursor-pointer"
                onClick={() => handleOpenRide(suggestion)}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {suggestion.driver_id
                          ? suggestion.available_seats &&
                            suggestion.available_seats > 1
                            ? "Need commuters"
                            : "Need a commuter"
                          : "Need a rider"}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {suggestion.driver_id ? "offer" : "request"}
                      </span>
                    </div>

                    <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
                      <Icon name="MapPin" size={14} className="text-success" />
                      <span>
                        {suggestion.pickup_location} →{" "}
                        {suggestion.drop_location}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="Clock" size={12} />
                        {formatTimeToAmPm(suggestion.time)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="Users" size={12} />
                        {suggestion.available_seats ||
                          suggestion.seats_required}{" "}
                        seats
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      dismissSuggestion(suggestion.id);
                    }}
                  >
                    <Icon name="X" size={14} />
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                      {suggestion.profile_image ? (
                        <Image
                          src={suggestion.profile_image}
                          alt={suggestion?.full_name?.[0]?.toUpperCase() ?? "?"}
                          width={36}
                          height={36}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <Icon name="User" size={14} className="text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {suggestion.full_name}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon name="Star" size={12} className="text-warning" />
                        {suggestion.avg_rating}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-foreground">
                      INR {suggestion.price_per_seat}
                    </span>
                    <Button variant="default" size="sm">
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <Link href="/search-rides">
          <Button variant="outline" className="w-full">
            <Icon name="Search" size={16} />
            Browse all rides
          </Button>
        </Link>
      </div>
    </motion.section>
  );
};

export default RideSuggestions;
