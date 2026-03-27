"use client";

import { useCallback, useEffect, useState } from "react";

import { listRideOffers, listRideRequests } from "@/lib/api/backend";

interface SuggestedRidesOptions {
  latitude?: number;
  longitude?: number;
  limit?: number;
  date?: string;
}

export function useFetchSuggestedRides(options: SuggestedRidesOptions = {}) {
  const [rideOffers, setRideOffers] = useState<FetchRides | null>();
  const [rideRequests, setRideRequests] = useState<FetchRides | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestedRides = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [offersData, requestsData] = await Promise.all([
        listRideOffers({
          pickup_lat: options.latitude,
          pickup_lng: options.longitude,
          limit: options.limit,
          date: options.date,
        }),
        listRideRequests({
          pickup_lat: options.latitude,
          pickup_lng: options.longitude,
          limit: options.limit,
          date: options.date,
        }),
      ]);

      setRideOffers(offersData);
      setRideRequests(requestsData);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch suggested rides");
    } finally {
      setLoading(false);
    }
  }, [options.latitude, options.longitude, options.limit, options.date]);

  useEffect(() => {
    void fetchSuggestedRides();
  }, [fetchSuggestedRides]);

  return { rideOffers, rideRequests, loading, error, refetch: fetchSuggestedRides };
}
