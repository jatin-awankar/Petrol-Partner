"use client";

import { useCallback, useEffect, useState } from "react";

import { listBookings } from "@/lib/api/backend";

interface BookingsProps {
  bookings: BookingsData[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
    total?: number;
  };
}

export function useFetchBookings(limit: number) {
  const [bookingsData, setBookingsData] = useState<BookingsProps>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listBookings({ limit, offset: 0 });
      setBookingsData(data);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  return { bookingsData, loading, error, refetch: fetchBookings };
}
