"use client";

import { useState } from "react";

export function useBookRide() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const bookRide = async (rideData: { ride_offer_id?: string; ride_request_id?: string; seats_booked?: number }) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/bookings/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for NextAuth session
        body: JSON.stringify(rideData),
      });

      if (!res.ok) throw new Error("Failed to book ride");
      setSuccess(true);
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { bookRide, loading, error, success };
}
