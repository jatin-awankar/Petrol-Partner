// /hooks/rides/useRideRequests.ts
"use client";

import { useState, useEffect, useCallback } from "react";

// Helper to get JWT token
const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

/* ------------------------------- FETCH ALL REQUESTS ------------------------------- */
export function useFetchRideRequests() {
  const [requests, setRequests] = useState<FetchRides | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rides/requests", {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) throw new Error("Failed to fetch ride requests");
      const data = await res.json();
      setRequests(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRideRequests();
  }, [fetchRideRequests]);

  return { requests, loading, error, refetch: fetchRideRequests };
}

/* ------------------------------- CREATE REQUEST ------------------------------- */
export function useCreateRideRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createRideRequest = async (requestData: any) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/rides/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!res.ok) throw new Error("Failed to create ride request");
      setSuccess(true);
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { createRideRequest, loading, error, success };
}

/* ------------------------------- UPDATE REQUEST ------------------------------- */
export function useUpdateRideRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRideRequest = async (id: string, updates: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/requests/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Failed to update ride request");
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { updateRideRequest, loading, error };
}

/* ------------------------------- DELETE REQUEST ------------------------------- */
export function useDeleteRideRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteRideRequest = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/requests/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) throw new Error("Failed to delete ride request");
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { deleteRideRequest, loading, error };
}
