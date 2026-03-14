"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
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

  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-5 mb-12 shadow-soft"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="Sparkles" size={18} className="text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Smart suggestions
            </h3>
            <p className="text-xs text-muted-foreground">
              Based on your recent activity and location
            </p>
          </div>
        </div>

        <Button variant="ghost" size="sm">
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">
          Loading smart suggestions...
        </div>
      ) : suggestions.length === 0 ? (
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
    </motion.section>
  );
};

export default SuggestedRides;
