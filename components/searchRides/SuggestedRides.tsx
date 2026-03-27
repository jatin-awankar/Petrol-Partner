"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import RideCard from "./RideCard";
import { useRouter } from "next/navigation";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import { todaysDate } from "@/lib/utils";

const SuggestedRides = () => {
  const router = useRouter();
  const { rideOffers, rideRequests, loading, refetch } = useFetchSuggestedRides(
    {
      limit: 4,
      date: todaysDate.toISOString(),
    },
  );

  const suggestions = useMemo(() => {
    const offers = Array.isArray(rideOffers?.rides)
      ? (rideOffers?.rides as CombineRideData[])
      : [];
    const requests = Array.isArray(rideRequests?.rides)
      ? (rideRequests?.rides as CombineRideData[])
      : [];
    return [...offers, ...requests].slice(0, 4);
  }, [rideOffers, rideRequests]);

  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/70 bg-card p-4 md:p-5 shadow-card h-full"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="Lightbulb" size={20} className="text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              Suggested now
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Matching today&apos;s active routes
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void refetch()}
        >
          <Icon name="RefreshCw" size={14} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">
          Loading suggestions...
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No suggestions right now.
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              onClick={handleOpenRide}
              loading={false}
            />
          ))}
        </div>
      )}
    </motion.section>
  );
};

export default SuggestedRides;
