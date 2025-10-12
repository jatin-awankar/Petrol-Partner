"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getDistance } from "@/lib/utils";
import { Card } from "../ui/card";
import Skeleton from "react-loading-skeleton";
import RideCard, { Ride } from "./RideCard";
import { useRouter } from "next/navigation"; // ✅ Correct import for App Router
import { sleep } from "./SearchComponent";

const NearbyRides = () => {
  const router = useRouter();

  const [rides, setRides] = useState<{ offers: Ride[]; requests: Ride[] }>({
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
  const [nearbyRidesLoading, setNearbyRidesLoading] = useState(true);

  // Fetch all rides (mock or Supabase)
  useEffect(() => {
    const fetchRides = async () => {
      setNearbyRidesLoading(true);
      await sleep(900);

      const mockRides = {
        offers: [
          {
            id: "1",
            type: "offer",
            pickup: "College A",
            dropoff: "Hostel",
            time: "Today, 09:00 AM",
            price: "₹50",
            seatsAvailable: 2,
            driver: {
              id: "d101",
              name: "Neha",
              gender: "female",
              college: "IIT",
              age: 23,
            },
            distanceKm: 3.2,
            coords: { lat: 19.043, lng: 72.865 },
          },
          {
            id: "2",
            type: "offer",
            pickup: "Station",
            dropoff: "Campus",
            time: "Today, 11:00 AM",
            price: "₹30",
            seatsAvailable: 1,
            driver: {
              id: "d102",
              name: "Rohit",
              gender: "male",
              college: "NIT",
              age: 26,
            },
            distanceKm: 2.1,
            coords: { lat: 19.101, lng: 72.88 },
          },
        ],
        requests: [
          {
            id: "3",
            type: "request",
            pickup: "Dorm",
            dropoff: "Library",
            time: "Tomorrow, 08:00 AM",
            passenger: {
              id: "p101",
              name: "Meera",
              gender: "female",
              college: "MIT",
              age: 22,
            },
            coords: { lat: 19.045, lng: 72.875 },
          },
        ],
      };

      // Convert `type` string to correct RideType on mockRides before setting state (or cast as Ride)
      const typedRides = {
        offers: mockRides.offers.map(
          (ride) =>
            ({
              ...ride,
              type: ride.type === "offer" ? "offer" : "request",
            } as Ride)
        ),
        requests: mockRides.requests.map(
          (ride) =>
            ({
              ...ride,
              type: ride.type === "request" ? "request" : "offer",
            } as Ride)
        ),
      };

      setRides(typedRides);
      setFilteredRides(typedRides);
      setNearbyRidesLoading(false);
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
          setShowNearby(true);
          setUserLocation(coords);
          setLoadingLocation(false);
          setFilteredRides(rides);
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
    }
  };
  
  // Filter nearby rides when location changes
  useEffect(() => {
    if (showNearby && userLocation && rides.offers.length > 0) {
      const radius = 8; // km radius
      const filterByDistance = (ride: Ride) => {
        const distance = getDistance(
          userLocation.lat,
          userLocation.lng,
          ride.coords?.lat || 0,
          ride.coords?.lng || 0
        );
        return distance <= radius;
      };
  
      const nearbyOffers = rides.offers.filter(filterByDistance);
      const nearbyRequests = rides.requests.filter(filterByDistance);
  
      // If no nearby rides found, fallback to showing all for demo/mock
      if (nearbyOffers.length === 0 && nearbyRequests.length === 0) {
        setFilteredRides(rides);
      } else {
        setFilteredRides({ offers: nearbyOffers, requests: nearbyRequests });
      }
    }
  }, [userLocation, showNearby, rides]);
  

  const handleOpenRide = (ride: Ride) => {
    router.push(`/search-rides/${ride.id}`); // ✅ Correct dynamic route
  };

  return (
    <motion.div
      className="container mx-auto space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Filter Button */}
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-row justify-between items-center gap-4"
      >
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft /> Back
        </Button>
        <Button
          onClick={handleShowNearby}
          variant={showNearby ? "secondary" : "default"}
          className="flex items-center gap-2"
        >
          {loadingLocation ? <Loader2 className="animate-spin w-4 h-4" /> : null}
          {showNearby ? "Showing Nearby Rides" : "Show Nearby Rides"}
        </Button>
      </motion.div>
      {showNearby && (
  <>
    {/* Ride Offers */}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-border rounded-2xl p-6 shadow-soft mb-4"
    >
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Ride Offers
      </h3>
      {nearbyRidesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton height={110} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredRides.offers.map((s) => (
            <RideCard key={s.id} ride={s} onClick={handleOpenRide} />
          ))}
        </div>
      )}
    </motion.div>

    {/* Ride Requests */}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="bg-card border border-border rounded-2xl p-6 shadow-soft mb-4"
    >
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Ride Requests
      </h3>
      {nearbyRidesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton height={110} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredRides.requests.map((s) => (
            <RideCard key={s.id} ride={s} onClick={handleOpenRide} />
          ))}
        </div>
      )}
    </motion.div>
  </>
)}

    </motion.div>
  );
};

export default NearbyRides;
