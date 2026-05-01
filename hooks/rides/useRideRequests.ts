"use client";

import { useCallback, useEffect, useState } from "react";

import { createRideRequestRecord, listRideRequests } from "@/lib/api/backend";

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

export function useFetchRideRequests() {
  const [requests, setRequests] = useState<FetchRides | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listRideRequests({});
      setRequests({
        ...data,
        rides: filterOutPastDateRides((data?.rides ?? []) as any[]),
      });
    } catch (err: any) {
      setError(err?.message || "Failed to fetch ride requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRideRequests();
  }, [fetchRideRequests]);

  return { requests, loading, error, refetch: fetchRideRequests };
}

export function useCreateRideRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createRideRequest = async (rideData: any) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const payload = await createRideRequestRecord(rideData);
      setSuccess(true);
      return payload;
    } catch (err: any) {
      setError(err?.message || "Failed to create ride request");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createRideRequest, loading, error, success };
}

export function useUpdateRideRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRideRequest = async () => {
    setLoading(true);
    setError("Ride request editing has not been migrated yet.");
    setLoading(false);
    throw new Error("Ride request editing has not been migrated yet.");
  };

  return { updateRideRequest, loading, error };
}

export function useDeleteRideRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteRideRequest = async () => {
    setLoading(true);
    setError("Ride request deletion has not been migrated yet.");
    setLoading(false);
    throw new Error("Ride request deletion has not been migrated yet.");
  };

  return { deleteRideRequest, loading, error };
}
