"use client";

import { useState } from "react";

import { createBookingRecord } from "@/lib/api/backend";

type PaymentMethod = "upi" | "cash" | "wallet" | "online";

interface BookRideInput {
  ride_offer_id?: string;
  ride_request_id?: string;
  seats_booked?: number;
  payment_method?: PaymentMethod;
}

export function useBookRide() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const bookRide = async (rideData: BookRideInput) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const booking = await createBookingRecord({
        ride_offer_id: rideData.ride_offer_id,
        ride_request_id: rideData.ride_request_id,
        seats_booked: rideData.seats_booked || 1,
      });

      setSuccess(true);
      return {
        booking_id: booking.booking_id,
        booking,
        settlement_note:
          "Payment will happen after ride completion through settlement confirmation.",
      };
    } catch (err: any) {
      setError(err?.message || "Failed to create booking");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { bookRide, loading, error, success };
}
