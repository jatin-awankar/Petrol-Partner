"use client";

import { useState, useEffect, useCallback } from "react";
import { frontendConfig } from "@/lib/frontend-config";

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
      if (!frontendConfig.flags.enableRatingsUi) {
        setRatings([]);
        setLoading(false);
        setError("Ratings are disabled.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/ratings/ride/${rideId}`);

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
