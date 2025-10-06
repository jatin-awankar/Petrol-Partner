"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

export function useRideBookings() {
  const [bookedRides, setBookedRides] = useState<RideBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const fetchBookedRides = useCallback(async () => {
    if (!user) return setLoading(false);

    try {
      setLoading(true);

      // 1️⃣ Get user's profile ID
      const { data: profile, error: profileError } = await supabaseClient
        .from("user_profiles")
        .select("id")
        .eq("clerk_id", user.id)
        .maybeSingle();
      if (profileError) throw new Error("Profile not found");
      if (!profile) return setBookedRides([]);

      // 2️⃣ Fetch bookings + ride_offers + ride_requests + driver/passenger
      const { data, error } = await supabaseClient
        .from("bookings")
        .select(
          `
          *,
          ride_offer:ride_offers (
            id,
            origin_address,
            destination_address,
            departure_time,
            ride_offer_description,
            ride_offer_status,
            driver:user_profiles!ride_offers_driver_id_fkey(id, full_name, avatar_url, college, avg_rating)
          ),
          ride_request:ride_requests (
            id,
            origin_address,
            destination_address,
            departure_time,
            ride_request_description,
            ride_request_status,
            passenger:user_profiles!ride_requests_passenger_id_fkey(id, full_name, avatar_url, college, avg_rating)
          ),
          rider:user_profiles!bookings_rider_id_fkey(
            id,
            full_name,
            avatar_url,
            college,
            avg_rating
          )
        `
        )
        .eq("rider_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching booked rides:", error);
        throw error;
      }
      setBookedRides(data || []);
    } catch (err: unknown) {
      console.error("Error fetching booked rides:", err);
      toast.error(
        `Error fetching booked rides: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setBookedRides([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const checkIfRated = async (bookingId: string, ratedId: string) => {
    if (!user) return false;
    try {
      const { data, error } = await supabaseClient
        .from("ride_reviews")
        .select("id")
        .eq("reviewer_id", user.id)
        .eq("reviewee_id", ratedId)
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return !!data;
    } catch {
      return false;
    }
  };

  const getCompletedRidesNeedingRating = async () => {
    if (!user) return [];
    try {
      const unrated: RideBooking[] = [];
      for (const booking of bookedRides) {
        if (
          booking.ride_offer &&
          booking.ride_offer.ride_offer_status === "completed" &&
          booking.ride_offer.driver
        ) {
          const rated = await checkIfRated(
            booking.id,
            booking.ride_offer.driver.id
          );
          if (!rated) unrated.push(booking);
        }
        if (
          booking.ride_request &&
          booking.ride_request.ride_request_status === "completed" &&
          booking.ride_request.passenger
        ) {
          const rated = await checkIfRated(
            booking.id,
            booking.ride_request.passenger.id
          );
          if (!rated) unrated.push(booking);
        }
      }
      return unrated;
    } catch (err) {
      console.error("Error fetching rides needing rating:", err);
      return [];
    }
  };

  useEffect(() => {
    fetchBookedRides();
  }, [fetchBookedRides, user]);

  return {
    bookedRides,
    loading,
    fetchBookedRides,
    checkIfRated,
    getCompletedRidesNeedingRating,
  };
}
