"use client";

import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import Skeleton from "react-loading-skeleton";
import RideCard, { Ride } from "./RideCard";
import { useRouter } from "next/navigation";
import { sleep } from "./SearchComponent";

const SuggestedRides = () => {
  const router = useRouter();

  const [suggestions, setSuggestions] = useState<Ride[]>([]);

  const [suggestionLoading, setSuggestionLoading] = useState(true);

    /* -------------------- mock suggestions (smart) ---------------------- */
    useEffect(() => {
        let cancelled = false;
    
        (async () => {
          setSuggestionLoading(true);
          await sleep(900);
          if (cancelled) return;
    
          // pick 3-4 offers/requests near "user"
          const mockSuggestions: Ride[] = [
            {
              id: "s1",
              type: "offer",
              pickup: "Hostel Gate",
              dropoff: "Central Park",
              time: "Today, 06:00 PM",
              price: "₹45",
              seatsAvailable: 2,
              driver: {
                id: "d101",
                name: "Neha",
                gender: "female",
                college: "IIT",
                age: 23,
              },
              distanceKm: 3.2,
            },
            {
              id: "s2",
              type: "offer",
              pickup: "Library",
              dropoff: "City Mall",
              time: "Today, 07:30 PM",
              price: "₹70",
              seatsAvailable: 3,
              driver: {
                id: "d102",
                name: "Rohit",
                gender: "male",
                college: "NIT",
                age: 26,
              },
              distanceKm: 4.1,
            },
            {
              id: "s3",
              type: "request",
              pickup: "Hostel Gate",
              dropoff: "Airport",
              time: "Tomorrow, 08:00 AM",
              passenger: {
                id: "p101",
                name: "Meera",
                gender: "female",
                college: "MIT",
                age: 22,
              },
            },
          ];
    
          setSuggestions(mockSuggestions);
          setSuggestionLoading(false);
        })();
    
        return () => {
          cancelled = true;
        };
      }, []);

  const handleOpenRide = (ride: Ride) => {
    // navigate to ride details (mock route)
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

      {suggestionLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton height={110} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suggestions.map((s) => (
            <RideCard key={s.id} ride={s} onClick={handleOpenRide} />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default SuggestedRides;
