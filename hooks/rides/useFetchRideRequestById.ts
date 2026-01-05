// /hooks/rides/useFetchRideRequestById.ts
"use client";

import { useState, useEffect, useCallback } from "react";

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
      const res = await fetch(`/api/rides/requests/${id}`, {
        credentials: "include", // Include cookies for NextAuth session
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Ride request not found");
        }
        throw new Error("Failed to fetch ride request");
      }
      const data = await res.json();
      setRideRequest(data.ride || data);
    } catch (err: any) {
      setError(err?.message || "Unknown error occurred");
      setRideRequest(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRideRequest();
  }, [fetchRideRequest, id]);

  return { rideRequest, loading, error, refetch: fetchRideRequest };
}
