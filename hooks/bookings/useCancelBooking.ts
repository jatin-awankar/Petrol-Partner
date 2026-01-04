"use client";

import { useState } from "react";

export function useCancelBooking() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelBooking = async (bookingId: string, newStatus: string = "cancelled") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/updateStatus`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for NextAuth session
        body: JSON.stringify({ booking_id: bookingId, new_status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to cancel booking");
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { cancelBooking, loading, error };
}
