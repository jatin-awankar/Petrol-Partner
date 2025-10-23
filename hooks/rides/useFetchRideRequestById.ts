// /hooks/rides/useFetchRideRequestById.ts
"use client";

import { useState, useEffect, useCallback } from "react";

const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

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
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) throw new Error("Failed to fetch ride request");
      const data = await res.json();
      setRideRequest(data);
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
