"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getDistance } from "@/lib/utils";
import RideCard from "./RideCard";
import { useRouter } from "next/navigation";
import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import Icon from "../AppIcon";

const NearbyRides = () => {
  const router = useRouter();
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [locationError, setLocationError] = useState("");

  const { rideOffers, rideRequests, loading } = useFetchSuggestedRides({
    latitude: userLocation?.lat,
    longitude: userLocation?.lng,
    limit: 12,
  });

  const offers = (rideOffers?.rides ?? []) as CombineRideData[];
  const requests = (rideRequests?.rides ?? []) as CombineRideData[];

  const nearby = useMemo(() => {
    if (!showNearby || !userLocation) {
      return { offers: [], requests: [] };
    }

    const radiusKm = 3;
    const filterByDistance = (ride: CombineRideData) => {
      const lat = ride.pickup_lat || ride.drop_lat;
      const lng = ride.pickup_lng || ride.drop_lng;
      if (!lat || !lng) return false;
      return (
        getDistance(userLocation.lat, userLocation.lng, lat, lng) <= radiusKm
      );
    };

    return {
      offers: offers.filter(filterByDistance).slice(0, 3),
      requests: requests.filter(filterByDistance).slice(0, 3),
    };
  }, [showNearby, userLocation, offers, requests]);

  useEffect(() => {
    if (!showNearby) {
      setLocationError("");
    }
  }, [showNearby]);

  const handleShowNearby = () => {
    if (showNearby) {
      setShowNearby(false);
      return;
    }

    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(coords);
        setShowNearby(true);
        setLocationError("");
        setLoadingLocation(false);
      },
      () => {
        setLocationError(
          "Location access is blocked. Enable it to view nearby rides.",
        );
        setLoadingLocation(false);
      },
    );
  };

  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/70 bg-card p-4 md:p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Nearby availability
            </h3>
            <p className="text-xs text-muted-foreground">
              Discover rides around your live pickup radius
            </p>
          </div>
        </div>

        <Button
          onClick={handleShowNearby}
          variant={showNearby ? "secondary" : "default"}
          className="h-10 px-4"
        >
          {loadingLocation ? (
            <Loader2 className="animate-spin h-4 w-4" />
          ) : (
            <Icon name="Navigation" size={16} />
          )}
          {showNearby ? "Hide nearby rides" : "Use my location"}
        </Button>
      </div>

      {!showNearby ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-muted/30 p-5 text-sm text-muted-foreground">
          Turn on location to prioritize rides near you first.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              Nearby offers
            </h4>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : nearby.offers.length ? (
              <div className="space-y-3">
                {nearby.offers.map((ride) => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    onClick={handleOpenRide}
                    loading={false}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No offers in your radius yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              Nearby requests
            </h4>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : nearby.requests.length ? (
              <div className="space-y-3">
                {nearby.requests.map((ride) => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    onClick={handleOpenRide}
                    loading={false}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No requests in your radius yet.
              </p>
            )}
          </div>
        </div>
      )}

      {locationError ? (
        <p className="mt-3 text-sm text-destructive">{locationError}</p>
      ) : null}
    </motion.section>
  );
};

export default NearbyRides;
