// /hooks/rides/useFetchSuggestedRides.ts
"use client";

import { useState, useEffect, useCallback } from "react";

const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("access_token");
  }
  return null;
};

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

    const query = new URLSearchParams();
    if (options.latitude) query.append("pickup_lat", String(options.latitude));
    if (options.longitude) query.append("pickup_lng", String(options.longitude));
    if (options.limit) query.append("limit", String(options.limit));
    if (options.date) query.append("date", String(options.date));

    try {
      // Fetch suggested ride offers
      const offersRes = await fetch(`/api/rides/offers?${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!offersRes.ok) throw new Error("Failed to fetch suggested ride offers");
      const offersData = await offersRes.json();
      setRideOffers(offersData);

      // Fetch suggested ride requests
      const requestsRes = await fetch(`/api/rides/requests?${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!requestsRes.ok) throw new Error("Failed to fetch suggested ride requests");
      const requestsData = await requestsRes.json();
      setRideRequests(requestsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options.latitude, options.longitude, options.limit]);

  useEffect(() => {
    fetchSuggestedRides();
  }, [fetchSuggestedRides]);

  return { rideOffers, rideRequests, loading, error, refetch: fetchSuggestedRides };
}
