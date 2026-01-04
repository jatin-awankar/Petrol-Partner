// /hooks/rides/useSearchRides.ts
"use client";

import { useState, useEffect, useCallback } from "react";

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

    const query = new URLSearchParams();
    if (filters.pickup) query.append("pickup", filters.pickup);
    if (filters.drop) query.append("drop", filters.drop);
    query.append("page", String(filters.page || 1));
    query.append("limit", String(filters.limit || 5));

    try {
      // Fetch ride offers
      const offersRes = await fetch(`/api/rides/offers?${query}`, {
        credentials: "include", // Include cookies for NextAuth session
      });
      if (!offersRes.ok) throw new Error("Failed to fetch ride offers");
      const offersData = await offersRes.json();
      setRideOffers(offersData.rides || offersData);

      // Fetch ride requests
      const requestsRes = await fetch(`/api/rides/requests?${query}`, {
        credentials: "include", // Include cookies for NextAuth session
      });
      if (!requestsRes.ok) throw new Error("Failed to fetch ride requests");
      const requestsData = await requestsRes.json();
      setRideRequests(requestsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.pickup, filters.drop, filters.page, filters.limit]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  return { rideOffers, rideRequests, loading, error, refetch: fetchRides };
}
