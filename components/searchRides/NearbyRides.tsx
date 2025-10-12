"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
// import RideList from '@/components/rides/RideList';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getDistance } from "@/lib/utils"; // We'll define this utility below

const NearbyRides = () => {
  const [rides, setRides] = useState<{ offers: any[]; requests: any[] }>({
    offers: [],
    requests: [],
  });
  const [filteredRides, setFilteredRides] = useState(rides);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [showNearby, setShowNearby] = useState(false);

  // Fetch all rides (mock or Supabase)
  useEffect(() => {
    const fetchRides = async () => {
      const mockRides = {
        offers: [
          {
            id: 1,
            pickup: "College A",
            dropoff: "Hostel",
            coords: { lat: 19.043, lng: 72.865 },
          },
          {
            id: 2,
            pickup: "Station",
            dropoff: "Campus",
            coords: { lat: 19.101, lng: 72.88 },
          },
        ],
        requests: [
          {
            id: 3,
            pickup: "Dorm",
            dropoff: "Library",
            coords: { lat: 19.045, lng: 72.875 },
          },
        ],
      };
      setRides(mockRides);
      setFilteredRides(mockRides);
    };
    fetchRides();
  }, []);

  const handleShowNearby = async () => {
    if (!showNearby) {
      setLoadingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserLocation(coords);
          setShowNearby(true);
          setLoadingLocation(false);
        },
        (err) => {
          console.error(err);
          setLoadingLocation(false);
          alert("Unable to get your location.");
        }
      );
    } else {
      // Reset filter
      setShowNearby(false);
      setFilteredRides(rides);
    }
  };

  // Filter nearby rides when userLocation changes
  useEffect(() => {
    if (showNearby && userLocation && rides.offers.length > 0) {
      const radius = 8; // km radius
      const filterByDistance = (ride: any) => {
        const distance = getDistance(
          userLocation.lat,
          userLocation.lng,
          ride.coords.lat,
          ride.coords.lng
        );
        return distance <= radius;
      };
      setFilteredRides({
        offers: rides.offers.filter(filterByDistance),
        requests: rides.requests.filter(filterByDistance),
      });
    }
  }, [rides.offers, rides.requests, showNearby, userLocation]);

  return (
    <motion.div
      className="container mx-auto p-6 space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row justify-between items-center gap-4"
      >
        <Button
          onClick={handleShowNearby}
          variant={showNearby ? "secondary" : "default"}
          className="flex items-center gap-2"
        >
          {loadingLocation ? (
            <Loader2 className="animate-spin w-4 h-4" />
          ) : null}
          {showNearby ? "Show All Rides" : "Show Nearby Rides"}
        </Button>
      </motion.div>

      {/* Ride Offers Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="space-y-4"
      >
        <h2 className="text-2xl font-semibold">Ride Offers</h2>
        {/* <RideList rides={filteredRides.offers} type="offer" /> */}
      </motion.div>

      {/* Ride Requests Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="space-y-4"
      >
        <h2 className="text-2xl font-semibold">Ride Requests</h2>
        {/* <RideList rides={filteredRides.requests} type="request" /> */}
      </motion.div>
    </motion.div>
  );
};

export default NearbyRides;
