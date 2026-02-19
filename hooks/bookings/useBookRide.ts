"use client";

import { useState } from "react";
import { loadRazorpay } from "@/lib/razorpay-client";

type PaymentMethod = "upi" | "cash" | "wallet";

interface BookRideInput {
  ride_offer_id?: string;
  ride_request_id?: string;
  seats_booked?: number;
  payment_method?: PaymentMethod;
}

interface CreateBookingResponse {
  booking_id: string;
  message?: string;
  error?: string;
}

interface RazorpayOrderResponse {
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  booking_id: string;
  error?: string;
}

interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

async function createBooking(rideData: BookRideInput) {
  const response = await fetch("/api/bookings/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      ride_offer_id: rideData.ride_offer_id,
      ride_request_id: rideData.ride_request_id,
      seats_booked: rideData.seats_booked || 1,
    }),
  });

  const data = (await response.json()) as CreateBookingResponse;

  if (!response.ok) {
    throw new Error(data.error || "Failed to create booking");
  }

  return data;
}

async function cancelBookingIfExists(bookingId: string) {
  await fetch("/api/bookings/updateStatus", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      booking_id: bookingId,
      new_status: "cancelled",
    }),
  });
}

export function useBookRide() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const bookRide = async (rideData: BookRideInput) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    let bookingId: string | null = null;

    try {
      const booking = await createBooking(rideData);
      bookingId = booking.booking_id;

      if (rideData.payment_method !== "upi") {
        setSuccess(true);
        return booking;
      }

      const scriptLoaded = await loadRazorpay();
      if (!scriptLoaded) {
        throw new Error("Failed to load Razorpay checkout");
      }

      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          booking_id: bookingId,
        }),
      });

      const orderData = (await orderRes.json()) as RazorpayOrderResponse;

      if (!orderRes.ok) {
        throw new Error(orderData.error || "Failed to create Razorpay order");
      }

      const verificationResult = await new Promise<any>((resolve, reject) => {
        const razorpay = new window.Razorpay({
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Petrol Partner",
          description: "Ride booking payment",
          order_id: orderData.order_id,
          handler: async (paymentResponse: RazorpayPaymentResponse) => {
            try {
              const verifyRes = await fetch("/api/payments/verify", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  booking_id: bookingId,
                  razorpay_order_id: paymentResponse.razorpay_order_id,
                  razorpay_payment_id: paymentResponse.razorpay_payment_id,
                  razorpay_signature: paymentResponse.razorpay_signature,
                }),
              });

              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) {
                reject(new Error(verifyData.error || "Payment verification failed"));
                return;
              }

              resolve({ booking_id: bookingId, ...verifyData });
            } catch (verifyError: any) {
              reject(new Error(verifyError.message || "Payment verification failed"));
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled by user")),
          },
          theme: {
            color: "#10b981",
          },
        });

        razorpay.on("payment.failed", () => reject(new Error("Payment failed")));
        razorpay.open();
      });

      setSuccess(true);
      return verificationResult;
    } catch (err: any) {
      if (bookingId && rideData.payment_method === "upi") {
        try {
          await cancelBookingIfExists(bookingId);
        } catch {
          // no-op: preserve original payment failure message
        }
      }

      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { bookRide, loading, error, success };
}
