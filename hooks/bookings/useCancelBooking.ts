"use client";

import { useState } from "react";

import { updateBookingStatusLegacy } from "@/lib/api/backend";

export function useCancelBooking() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelBooking = async (
    bookingId: string,
    newStatus: "confirmed" | "cancelled" | "completed" = "cancelled",
  ) => {
    setLoading(true);
    setError(null);

    try {
      return await updateBookingStatusLegacy({
        booking_id: bookingId,
        new_status: newStatus,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to update booking");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { cancelBooking, loading, error };
}
