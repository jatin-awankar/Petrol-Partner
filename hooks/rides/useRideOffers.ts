"use client";

import { useCallback, useEffect, useState } from "react";

import { createRideOfferRecord, listRideOffers } from "@/lib/api/backend";

function getLocalTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function filterOutPastDateRides<T extends { date?: string }>(rides: T[]) {
  const today = getLocalTodayIsoDate();
  return rides.filter((ride) => {
    if (!ride?.date) {
      return false;
    }

    return ride.date >= today;
  });
}

export function useFetchRideOffers() {
  const [offers, setOffers] = useState<FetchRides | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideOffers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listRideOffers({});
      setOffers({
        ...data,
        rides: filterOutPastDateRides((data?.rides ?? []) as any[]),
      });
    } catch (err: any) {
      setError(err?.message || "Failed to fetch ride offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRideOffers();
  }, [fetchRideOffers]);

  return { offers, loading, error, refetch: fetchRideOffers };
}

export function useCreateRideOffer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createRideOffer = async (rideData: any) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const payload = await createRideOfferRecord(rideData);
      setSuccess(true);
      return payload;
    } catch (err: any) {
      setError(err?.message || "Failed to create ride offer");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createRideOffer, loading, error, success };
}

export function useUpdateRideOffer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRideOffer = async () => {
    setLoading(true);
    setError("Ride offer editing has not been migrated yet.");
    setLoading(false);
    throw new Error("Ride offer editing has not been migrated yet.");
  };

  return { updateRideOffer, loading, error };
}

export function useDeleteRideOffer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteRideOffer = async () => {
    setLoading(true);
    setError("Ride offer deletion has not been migrated yet.");
    setLoading(false);
    throw new Error("Ride offer deletion has not been migrated yet.");
  };

  return { deleteRideOffer, loading, error };
}
