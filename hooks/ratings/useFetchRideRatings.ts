"use client";

import { useState, useEffect, useCallback } from "react";

const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

export function useFetchRideRatings(rideId: string | null) {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRatings = useCallback(
    async () => {
      if (!rideId) {
        setRatings([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/ratings/ride/${rideId}`, {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        });

        if (!res.ok) throw new Error("Failed to fetch ride ratings");
        const data = await res.json();
        setRatings(data);
      } catch (err: any) {
        setError(err.message ?? String(err));
        setRatings([]);
      } finally {
        setLoading(false);
      }
    },
    [rideId]
  );

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings, rideId]);

  return { ratings, loading, error, refetch: fetchRatings };
}
