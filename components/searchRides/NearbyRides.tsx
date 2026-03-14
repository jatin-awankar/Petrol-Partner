"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getDistance } from "@/lib/utils";
import RideCard from "./RideCard";
import { useRouter } from "next/navigation";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";

const NearbyRides = () => {
  const router = useRouter();

  const [rides, setRides] = useState<{
    offers: CombineRideData[];
    requests: CombineRideData[];
  }>({
    offers: [],
    requests: [],
  });
  const [filteredRides, setFilteredRides] = useState(rides);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [showNearby, setShowNearby] = useState(false);

  const { rideOffers, rideRequests, loading } = useFetchSuggestedRides({
    latitude: userLocation?.lat,
    longitude: userLocation?.lng,
  });

  useEffect(() => {
    const offers =
      rideOffers && Array.isArray(rideOffers.rides) ? rideOffers.rides : [];
    const requests =
      rideRequests && Array.isArray(rideRequests.rides)
        ? rideRequests.rides
        : [];

    const typedRides = {
      offers: rideOffers?.rides.map(
        (ride) =>
          ({
            ...ride,
            type: ride.type === "offer" ? "offer" : "request",
          } as RideOfferData)
      ),
      requests: rideRequests?.rides.map(
        (ride) =>
          ({
            ...ride,
            type: ride.type === "request" ? "request" : "offer",
          } as RideRequestData)
      ),
    };

    setRides({ offers: offers ?? [], requests: requests ?? [] });
    setFilteredRides({
      offers: typedRides.offers ?? [],
      requests: typedRides.requests ?? [],
    });
  }, [rideOffers, rideRequests]);

  useEffect(() => {
    if (showNearby && userLocation && rides.offers.length > 0) {
      const radius = 1;
      const filterByDistance = (ride: CombineRideData) => {
        const distance = getDistance(
          userLocation.lat,
          userLocation.lng,
          ride.pickup_lat || ride.drop_lat || 0,
          ride.pickup_lng || ride.drop_lng || 0
        );
        return distance <= radius;
      };

      const nearbyOffers = rides.offers.filter(filterByDistance);
      const nearbyRequests = rides.requests.filter(filterByDistance);

      if (nearbyOffers.length === 0 && nearbyRequests.length === 0) {
        setFilteredRides(rides);
      } else {
        setFilteredRides({ offers: nearbyOffers, requests: nearbyRequests });
      }
    }
  }, [userLocation, showNearby, rides]);

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
      setShowNearby(false);
    }
  };

  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  return (
    <motion.section
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Nearby rides</h2>
          <p className="text-xs text-muted-foreground">
            Turn on location to see pickups near you
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft /> Back
          </Button>
          <Button
            onClick={handleShowNearby}
            variant={showNearby ? "secondary" : "default"}
            className="flex items-center gap-2"
          >
            {loadingLocation ? <Loader2 className="animate-spin w-4 h-4" /> : null}
            {showNearby ? "Showing Nearby" : "Show Nearby"}
          </Button>
        </div>
      </div>

      {showNearby && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Ride Offers
            </h3>
            {loading ? (
              <div className="py-4 text-center text-muted-foreground">
                Loading nearby ride requests...
              </div>
            ) : filteredRides.offers.length ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredRides.offers.map((s) => (
                  <RideCard key={s.id} ride={s} onClick={handleOpenRide} loading={loading} />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No nearby rides found.
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Ride Requests
            </h3>
            {loading ? (
              <div className="py-4 text-center text-muted-foreground">
                Loading nearby ride offers...
              </div>
            ) : filteredRides.requests.length ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredRides.requests.map((s) => (
                  <RideCard key={s.id} ride={s} onClick={handleOpenRide} loading={loading} />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No nearby rides found.
              </div>
            )}
          </motion.div>
        </>
      )}
    </motion.section>
  );
};

export default NearbyRides;
