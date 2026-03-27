"use client";

import { useCallback, useEffect, useState } from "react";

import { getRideOffer } from "@/lib/api/backend";

export function useFetchRideOfferById(id: string | null) {
  const [rideOffer, setRideOffer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideOffer = useCallback(async () => {
    if (!id) {
      setRideOffer(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getRideOffer(id);
      setRideOffer(data);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
      setRideOffer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchRideOffer();
  }, [fetchRideOffer]);

  return { rideOffer, loading, error, refetch: fetchRideOffer };
}
