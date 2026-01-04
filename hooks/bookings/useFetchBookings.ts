"use client";

import { useState, useEffect, useCallback } from "react";

interface BookingsProps {
  bookings: BookingsData[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
  };
}

export function useFetchBookings(limit: number) {
  const [bookingsData, setBookingsData] = useState<BookingsProps>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (limit !== undefined && limit !== null)
      query.append("limit", String(limit));

    try {
      const res = await fetch(
        `/api/bookings/getUserBookings?${query.toString()}`,
        {
          method: "GET",
          credentials: "include", // Include cookies for NextAuth session
        }
      );
      if (!res.ok) throw new Error("Failed to fetch driver bookings");
      const data = await res.json();
      setBookingsData(data);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return { bookingsData, loading, error, refetch: fetchBookings };
}
