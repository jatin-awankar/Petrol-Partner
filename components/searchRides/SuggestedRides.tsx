"use client";

import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import Skeleton from "react-loading-skeleton";
import RideCard from "./RideCard";
import { useRouter } from "next/navigation";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import { todaysDate } from "@/lib/utils";

const SuggestedRides = () => {
  const router = useRouter();

  const { rideOffers, rideRequests, loading } = useFetchSuggestedRides({
    limit: 3,
    date: todaysDate.toISOString(),
  });
  const [suggestions, setSuggestions] = useState<CombineRideData[]>([]);

  useEffect(() => {
    const offers =
      rideOffers && Array.isArray(rideOffers.rides) ? rideOffers.rides : [];
    const requests =
      rideRequests && Array.isArray(rideRequests.rides)
        ? rideRequests.rides
        : [];
    setSuggestions([...offers, ...requests]);
  }, [rideOffers, rideRequests]);

  //---------------------------- handlers ------------------------------//
  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-6 shadow-soft mb-12 md:mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon name="Sparkles" size={18} className="text-primary" />
          <h3 className="text-lg font-semibold text-foreground">
            Smart Suggestions
          </h3>
          <div className="text-xs text-muted-foreground">
            Based on your recent activity & location
          </div>
        </div>

        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              /* could shuffle suggestions */
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No suggestions found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suggestions.map((s) => (
            <RideCard
              key={s.id}
              ride={s}
              onClick={handleOpenRide}
              loading={loading}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default SuggestedRides;
