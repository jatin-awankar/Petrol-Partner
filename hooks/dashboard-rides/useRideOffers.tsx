"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

export function useRideOffers() {
  const [rides, setRides] = useState<RideOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const fetchRides = useCallback(async () => {
    try {
      setLoading(true);

      // 1️⃣ Fetch ride_offers + driver info
      const { data: ridesData, error } = await supabaseClient
        .from("ride_offers")
        .select(
          `
          id,
          driver_id,
          origin_address,
          destination_address,
          departure_time,
          available_seats,
          price_per_seat,
          ride_offer_status,
          ride_offer_description,
          created_at,
          updated_at,
          driver:user_profiles!ride_offers_driver_id_fkey(id, full_name, avatar_url, college, avg_rating, is_verified)
        `
        )
        .order("departure_time", { ascending: false });

      if (error) throw error;
      if (!ridesData) {
        setRides([]);
        return;
      }

      const rideIds = ridesData.map((r) => r.id);

      // 2️⃣ Fetch all bookings for these ride_offers
      const { data: bookings, error: bookingsError } = await supabaseClient
        .from("bookings")
        .select("ride_offer_id, seats_booked")
        .in("ride_offer_id", rideIds);

      if (bookingsError) throw bookingsError;

      // 4️⃣ Merge bookings and ratings
      const ridesWithInfo = ridesData.map((ride) => {
        const totalBookedSeats =
          bookings
            ?.filter((b) => b.ride_offer_id === ride.id)
            .reduce((sum, b) => sum + b.seats_booked, 0) || 0;

        return {
          ...ride,
          driver: Array.isArray(ride.driver) ? ride.driver[0] : ride.driver,
          available_seats: ride.available_seats - totalBookedSeats,
          isAvailable: ride.available_seats - totalBookedSeats > 0,
        };
      });

      setRides(ridesWithInfo);
    } catch (error: unknown) {
      console.error("Error fetching rides:", error);
      toast.error("Error fetching rides", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const createRide = async (rideData: CreateRideData) => {
    try {
      const res = await fetch("/api/rides/create-ride-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rideData), // Send only ride data
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Unknown error");

      toast.success("Ride created successfully!", {
        description: "Your ride is now available for booking",
      });

      await fetchRides();

      return { data: result.ride, error: null };
    } catch (error: unknown) {
      console.error("Failed to create ride:", error);
      toast.error("Failed to create ride", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return { error };
    } finally {
      fetchRides();
    }
  };

  const bookRide = async (rideId: string, seatsBooked: number) => {
    if (!user) {
      toast.error("Authentication required", {
        description: "Please sign in to book a ride",
      });
      return { error: new Error("User not authenticated") };
    }

    try {
      // Check availability dynamically before booking
      const ride = rides.find((r) => r.id === rideId);
      if (!ride) throw new Error("Ride not found");
      if (!ride.isAvailable || seatsBooked > ride.available_seats)
        throw new Error(
          `Not enough seats available. Only ${ride.available_seats} left.`
        );

      const totalAmount = ride.price_per_seat * seatsBooked;

      const { data, error } = await supabaseClient
        .from("bookings")
        .insert([
          {
            ride_offer_id: rideId,
            rider_id: user.id,
            seats_booked: seatsBooked,
            total_price: totalAmount,
            booking_status: "pending",
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success("Ride booked successfully!", {
        description: `You've booked ${seatsBooked} seat(s) for ₹${totalAmount}`,
      });

      await fetchRides();
      return { data, error: null };
    } catch (error: unknown) {
      console.error("Failed to book ride:", error);
      toast.error("Failed to book ride", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return { error };
    }
  };

  const completeRide = async (rideId: string) => {
    if (!user) {
      toast.error("Authentication required", {
        description: "Please sign in to complete a ride",
      });
      return { error: new Error("User not authenticated") };
    }

    try {
      const { error } = await supabaseClient
        .from("ride_offers")
        .update({ ride_offer_status: "completed" })
        .eq("id", rideId)
        .eq("driver_id", user.id);

      if (error) throw error;

      toast.success("Ride completed successfully!", {
        description: "Passengers can now rate your service",
      });

      await fetchRides();
      return { error: null };
    } catch (error: unknown) {
      console.error("Failed to complete ride:", error);
      toast.error("Failed to complete ride", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  return {
    rides,
    loading,
    fetchRides,
    createRide,
    bookRide,
    completeRide,
  };
}
