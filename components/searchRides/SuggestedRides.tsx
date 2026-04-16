"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import RideCard from "./RideCard";
import { useRouter } from "next/navigation";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import { todaysDate } from "@/lib/utils";
import { RideCardSkeleton } from "./SearchRidesSkeletons";

const SuggestedRides = () => {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-warning/25 bg-gradient-to-br from-warning/10 via-card to-card p-4 md:p-5 shadow-card h-full"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-warning/30 bg-warning/15 p-2 text-warning">
              <Icon name="Lightbulb" size={16} className="text-warning" />
            </div>
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
          onClick={() => void handleRefresh()}
          disabled={refreshing}
        >
          <Icon
            name="RefreshCw"
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {loading && suggestions.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <RideCardSkeleton key={idx} compact />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No suggestions right now.
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((ride) => (
            <RideCard key={ride.id} ride={ride} onClick={handleOpenRide} />
          ))}
        </div>
      )}
    </motion.section>
  );
};

export default SuggestedRides;
