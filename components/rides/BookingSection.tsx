// components/ride/BookingSection.tsx
"use client";

import React, { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function BookingSection({ ride }: { ride?: RideOffer }) {
  const { getToken } = useAuth();
  const [seats, setSeats] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("upi_primary");
  const [loading, setLoading] = useState(false);

  const totalPrice = ride ? ride.price_per_seat * seats : 0;

  const bookNow = async () => {
    if (!ride) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rideId: ride.id,
          seatsBooked: seats,
          paymentMethod,
          totalPrice,
          pickupAddress: ride.origin_address,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Booking failed");
      alert("Booking created successfully");
      // redirect or update UI
    } catch (err: unknown) {
      console.error("bookNow error:", err);
      alert(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  if (!ride) return null;

  return (
    <div className="p-4 bg-card rounded-xl">
      <h4 className="font-semibold mb-2">Book this ride</h4>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-sm">Seats</label>
        <select
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          className="ml-2"
        >
          {Array.from({ length: Math.max(1, ride.available_seats) }).map(
            (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            )
          )}
        </select>
      </div>

      <div className="mb-3">
        <label className="text-sm block mb-1">Payment method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full"
        >
          <option value="upi_primary">UPI - rajesh.kumar@paytm</option>
          <option value="upi_secondary">UPI - rajesh@gpay</option>
          <option value="card_1">Card ending 4532</option>
          <option value="wallet">Wallet</option>
        </select>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-semibold">₹{totalPrice}</div>
        </div>
        <Button onClick={bookNow} disabled={loading} variant="default">
          {loading ? "Booking..." : "Book Now"}
        </Button>
      </div>
    </div>
  );
}
