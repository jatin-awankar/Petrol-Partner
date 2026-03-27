"use client";

import { useState, useEffect } from "react";
import { frontendConfig } from "@/lib/frontend-config";

export function useFetchUserAverageRating(userId: string | null) {
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAvgRating = async () => {
    if (!userId) return;
    if (!frontendConfig.flags.enableRatingsUi) {
      setAvgRating(null);
      setLoading(false);
      setError("Ratings are disabled.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ratings/user/${userId}/average`);

      if (!res.ok) throw new Error("Failed to fetch user average rating");
      const data = await res.json();
      setAvgRating(data.avg_rating);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvgRating();
  }, [userId]);

  return { avgRating, loading, error, refetch: fetchAvgRating };
}
