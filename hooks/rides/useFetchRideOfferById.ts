// /hooks/rides/useFetchRideOfferById.ts
"use client";

import { useState, useEffect, useCallback } from "react";

const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

export function useFetchRideOfferById(id: string | null) {
  const [rideOffer, setRideOffer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideOffer = useCallback(
    async () => {
      if (!id) {
        setRideOffer(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/rides/offers/${id}`, {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        });

        if (!res.ok) throw new Error("Failed to fetch ride offer");
        const data = await res.json();
        setRideOffer(data);
      } catch (err: any) {
        setError(err?.message ?? "Unknown error");
        setRideOffer(null);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchRideOffer();
  }, [fetchRideOffer, id]);

  return { rideOffer, loading, error, refetch: fetchRideOffer };
}
