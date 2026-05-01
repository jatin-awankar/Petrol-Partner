"use client";

import { useCallback, useEffect, useState } from "react";

import { listRideOffers, listRideRequests } from "@/lib/api/backend";

interface SuggestedRidesOptions {
  latitude?: number;
  longitude?: number;
  limit?: number;
  date?: string;
}

function getLocalTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function filterOutPastDateRides<T extends { date?: string }>(rides: T[]) {
  const today = getLocalTodayIsoDate();
  return rides.filter((ride) => {
    if (!ride?.date) {
      return false;
    }

    return ride.date >= today;
  });
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

      setRideOffers({
        ...offersData,
        rides: filterOutPastDateRides((offersData?.rides ?? []) as any[]),
      });
      setRideRequests({
        ...requestsData,
        rides: filterOutPastDateRides((requestsData?.rides ?? []) as any[]),
      });
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
