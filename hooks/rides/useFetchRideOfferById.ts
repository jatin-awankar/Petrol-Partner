// /hooks/rides/useFetchRideOfferById.ts
"use client";

import { useState, useEffect, useCallback } from "react";

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
          credentials: "include", // Include cookies for NextAuth session
        });

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Ride offer not found");
          }
          throw new Error("Failed to fetch ride offer");
        }
        const data = await res.json();
        setRideOffer(data.ride || data);
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
  }, [fetchRideOffer]);

  return { rideOffer, loading, error, refetch: fetchRideOffer };
}
