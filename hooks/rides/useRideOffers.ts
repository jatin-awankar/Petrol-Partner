// /hooks/rides/useRideOffers.ts
"use client";

import { useState, useEffect, useCallback } from "react";

// ✅ Helper function to get JWT token from localStorage or cookies
const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("access_token");
  }
  return null;
};

/* ------------------------------- FETCH ALL OFFERS ------------------------------- */
export function useFetchRideOffers() {
  const [offers, setOffers] = useState<FetchRides | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rides/offers", {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) throw new Error("Failed to fetch ride offers");
      const data = await res.json();
      setOffers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRideOffers();
  }, [fetchRideOffers]);

  return { offers, loading, error, refetch: fetchRideOffers };
}

/* ------------------------------- CREATE OFFER ------------------------------- */
export function useCreateRideOffer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createRideOffer = async (rideData: any) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/rides/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(rideData),
      });

      if (!res.ok) throw new Error("Failed to create ride offer");
      setSuccess(true);
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { createRideOffer, loading, error, success };
}

/* ------------------------------- UPDATE OFFER ------------------------------- */
export function useUpdateRideOffer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRideOffer = async (id: string, updates: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/offers/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Failed to update ride offer");
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { updateRideOffer, loading, error };
}

/* ------------------------------- DELETE OFFER ------------------------------- */
export function useDeleteRideOffer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteRideOffer = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/offers/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) throw new Error("Failed to delete ride offer");
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { deleteRideOffer, loading, error };
}
