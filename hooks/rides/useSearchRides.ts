"use client";

import { useCallback, useEffect, useState } from "react";

import { listRideOffers, listRideRequests } from "@/lib/api/backend";

interface SearchFilters {
  pickup?: string;
  drop?: string;
  page?: number;
  limit?: number;
}

export function useSearchRides(filters: SearchFilters) {
  const [rideOffers, setRideOffers] = useState<any[]>([]);
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRides = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [offersData, requestsData] = await Promise.all([
        listRideOffers({
          page: filters.page,
          limit: filters.limit,
        }),
        listRideRequests({
          page: filters.page,
          limit: filters.limit,
        }),
      ]);

      setRideOffers(offersData.rides || []);
      setRideRequests(requestsData.rides || []);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch rides");
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.limit]);

  useEffect(() => {
    void fetchRides();
  }, [fetchRides]);

  return { rideOffers, rideRequests, loading, error, refetch: fetchRides };
}
