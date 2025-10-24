"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { motion } from "framer-motion";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatTimeToAmPm, todaysDate } from "@/lib/utils";

const RideSuggestions: React.FC = () => {
  const router = useRouter();

  const [suggestions, setSuggestions] = useState<CombineRideData[] | null>(
    null
  );
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>(
    []
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

  const visibleSuggestions = suggestions?.filter(
    (s) => !dismissedSuggestions.includes(s.id)
  );

  if (!loading && (!visibleSuggestions || visibleSuggestions.length === 0))
    return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-border rounded-xl p-6 mb-6 shadow-soft"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Icon name="Zap" size={20} className="text-yellow-400 fill-current" />
          <h2 className="text-lg font-semibold text-foreground">
            Suggested Rides
          </h2>
        </div>
        <Button variant="ghost" size="sm">
          Customize
        </Button>
      </div>

      <div className="space-y-4">
        {loading
          ? Array.from({ length: 2 }).map((_, idx) => (
              <div
                key={idx}
                className="border border-border rounded-lg p-4 animate-pulse"
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
                className="border border-border rounded-lg p-4 hover:shadow-soft transition-shadow cursor-pointer"
                onClick={() => handleOpenRide(suggestion)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {suggestion.driver_id
                          ? suggestion.available_seats &&
                            suggestion.available_seats > 1
                            ? "Need Partners"
                            : "Need a Partner"
                          : "Need a Rider"}
                      </h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {suggestion.driver_id ? "offer" : "request"}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-sm text-foreground mb-2">
                      <Icon
                        name="MapPin"
                        size={14}
                        className="text-green-600"
                      />
                      <span>
                        {suggestion.pickup_location}&nbsp; → &nbsp;
                        {suggestion.drop_location}
                      </span>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Icon name="Clock" size={12} />
                        <span>{formatTimeToAmPm(suggestion.time)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Icon name="Users" size={12} />
                        <span>
                          {suggestion.available_seats ||
                            suggestion.seats_required}{" "}
                          seats
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissSuggestion(suggestion.id)}
                  >
                    <Icon name="X" size={14} />
                  </Button>
                </div>

                {/* Driver Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-400/10 rounded-full flex items-center justify-center">
                      {suggestion.profile_image ? (
                        <Image
                          src={suggestion.profile_image}
                          alt={suggestion?.full_name?.[0]?.toUpperCase() ?? "?"}
                          width={36}
                          height={36}
                          className="w-full rounded-full overflow-hidden"
                        />
                      ) : (
                        <Icon name="User" size={14} className="text-blue-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-foreground">
                          {suggestion.full_name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Icon
                          name="Star"
                          size={12}
                          className="text-warning fill-current"
                        />
                        <span className="text-xs text-muted-foreground">
                          {suggestion.avg_rating}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold text-foreground">
                      ₹{suggestion.price_per_seat}
                    </span>
                    <Button variant="default" size="sm">
                      Book Now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <Link href="/search-rides">
          <Button variant="outline" className="w-full">
            <Search />
            Browse All Available Rides
          </Button>
        </Link>
      </div>
    </motion.div>
  );
};

export default RideSuggestions;
