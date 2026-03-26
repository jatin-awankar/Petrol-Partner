"use client";

import { useCallback, useEffect, useState } from "react";

import { getRideRequest } from "@/lib/api/backend";

export function useFetchRideRequestById(id: string | null) {
  const [rideRequest, setRideRequest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideRequest = useCallback(async () => {
    if (!id) {
      setRideRequest(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getRideRequest(id);
      setRideRequest(data);
    } catch (err: any) {
      setError(err?.message || "Unknown error occurred");
      setRideRequest(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchRideRequest();
  }, [fetchRideRequest]);

  return { rideRequest, loading, error, refetch: fetchRideRequest };
}
