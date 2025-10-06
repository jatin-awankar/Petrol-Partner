"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabaseClient } from "@/lib/supabase/client";
import { useUser } from "@clerk/nextjs";

export function useRideRequests() {
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const fetchRideRequests = useCallback(async () => {
    try {
      setLoading(true);

      // 1️⃣ Fetch ride requests + passenger info
      const { data: requestsData, error: requestsError } = await supabaseClient
        .from("ride_requests")
        .select(
          `
          *,
          passenger:user_profiles!ride_requests_passenger_id_fkey(id, full_name, avatar_url, college, avg_rating)
        `
        )
        .eq("ride_request_status", "active")
        .order("departure_time", { ascending: true });

      if (requestsError) throw requestsError;
      if (!requestsData) {
        setRideRequests([]);
        return;
      }

      // 3️⃣ Fetch bookings per ride request
      const requestIds = requestsData.map((r) => r.id);
      const { data: bookingsData } = await supabaseClient
        .from("bookings")
        .select("ride_request_id, seats_booked")
        .in("ride_request_id", requestIds)
        .eq("booking_status", "pending"); // consider pending bookings

      // 4️⃣ Merge everything
      const mergedRequests: RideRequest[] = requestsData.map((req) => {
        const totalBookedSeats =
          bookingsData
            ?.filter((b) => b.ride_request_id === req.id)
            .reduce((sum, b) => sum + b.seats_booked, 0) || 0;

        return {
          ...req,
          passenger: Array.isArray(req.passenger)
            ? req.passenger[0]
            : req.passenger,
          seatsAvailable: totalBookedSeats < req.seats_needed,
        };
      });

      setRideRequests(mergedRequests);
    } catch (error: unknown) {
      console.error("Error fetching ride requests:", error);
      toast.error(
        "Error fetching ride requests: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
      setRideRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createRideRequest = async (requestData: CreateRideRequestData) => {
    if (!user) return { error: new Error("User not authenticated") };

    try {
      const res = await fetch("/api/rides/create-ride-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData), // Send only ride data
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Unknown error");

      toast.success("Ride Request created successfully!", {
        description: "Your request is now available for booking",
      });

      await fetchRideRequests();

      return { data: result.ride, error: null };
    } catch (error: unknown) {
      console.error("Failed to create ride request:", error);
      toast.error("Failed to create ride request", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return { error };
    } finally {
      fetchRideRequests();
    }
  };

  useEffect(() => {
    fetchRideRequests();
  }, [fetchRideRequests]);

  return {
    rideRequests,
    loading,
    fetchRideRequests,
    createRideRequest,
  };
}
