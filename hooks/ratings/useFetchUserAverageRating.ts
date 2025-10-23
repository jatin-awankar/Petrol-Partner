"use client";

import { useState, useEffect } from "react";

const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

export function useFetchUserAverageRating(userId: string | null) {
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAvgRating = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ratings/user/${userId}/average`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

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
