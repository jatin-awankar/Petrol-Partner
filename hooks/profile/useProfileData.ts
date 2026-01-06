"use client";

import { useState, useEffect, useCallback } from "react";
import { useUserProfile } from "@/hooks/auth/useUserProfile";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";

// Vehicle types matching the database schema
interface Vehicle {
  id: string;
  vehicle_number: string;
  manufacturer?: string | null;
  model?: string | null;
  vehicle_type?: string | null;
  manufacture_year?: number | null;
  fuel_type?: string | null;
  seat_capacity?: number | null;
  insurance_valid_upto?: string | null;
  fitness_valid_upto?: string | null;
  registered_at?: string | null;
  verified?: boolean;
  created_at?: string;
}

// Transformed vehicle format for UI components
interface TransformedVehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  seats: string;
  fuelType: string;
  photo: string; // Required by VehicleInfoSection, but we'll provide a default
  isVerified: boolean;
}

// User profile format for UI
interface UIUserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  college?: string;
  profilePhoto?: string;
  isCollegeVerified?: boolean;
  isDriverVerified?: boolean;
  rating?: number;
  totalRides?: number;
  dateOfBirth?: string;
  gender?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  address?: string;
}

// Fetch user vehicles
export const useUserVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/vehicle", {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        // If endpoint doesn't exist, return empty array
        if (res.status === 404) {
          setVehicles([]);
          return;
        }
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch vehicles");
      }

      const data = await res.json();
      setVehicles(data.vehicles || []);
    } catch (err: any) {
      // Silently handle 404 - vehicles endpoint may not exist yet
      if (err.message?.includes("404") || err.message?.includes("Not Found")) {
        setVehicles([]);
      } else {
        setError(err.message || "Error fetching vehicles");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  return { vehicles, loading, error, refetch: fetchVehicles };
};

// Transform database vehicle to UI format
const transformVehicle = (vehicle: Vehicle): TransformedVehicle => ({
  id: vehicle.id,
  make: vehicle.manufacturer || "Unknown",
  model: vehicle.model || "Unknown",
  year: vehicle.manufacture_year?.toString() || "Unknown",
  color: "Unknown", // Not in DB schema, defaulting
  licensePlate: vehicle.vehicle_number || "",
  seats: vehicle.seat_capacity?.toString() || "5",
  fuelType: vehicle.fuel_type?.toLowerCase() || "petrol",
  photo: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=300&h=200&fit=crop", // Default vehicle photo
  isVerified: vehicle.verified || false,
});

// Transform database user to UI format
const transformUserProfile = (
  user: ReturnType<typeof useUserProfile>["profile"]
): UIUserProfile | null => {
  if (!user) return null;

  return {
    id: user.id,
    name: user.full_name || "User",
    email: user.email || "",
    phone: user.phone || undefined,
    college: user.college || undefined,
    profilePhoto: user.profile_image || undefined,
    isCollegeVerified: user.is_verified || false,
    isDriverVerified: user.is_verified || false, // Assuming same for now
    rating: user.avg_rating || undefined,
    totalRides: undefined, // Not in user schema, can be calculated from bookings
    dateOfBirth: undefined,
    gender: undefined,
    emergencyContact: undefined,
    emergencyPhone: undefined,
    address: undefined,
  };
};

// Main hook that combines all profile data
export const useProfileData = () => {
  const { profile: userProfile, loading: userLoading, error: userError, fetchProfile } =
    useUserProfile();
  const { vehicles, loading: vehiclesLoading, error: vehiclesError, refetch: refetchVehicles } =
    useUserVehicles();
  const {
    bookingsData,
    loading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useFetchBookings(10);

  const loading =
    userLoading || vehiclesLoading || bookingsLoading;
  const error = userError || vehiclesError || bookingsError;

  const user = transformUserProfile(userProfile);
  const transformedVehicles = vehicles.map(transformVehicle);

  // Calculate total rides from bookings
  const totalRides = bookingsData?.bookings?.length || 0;

  return {
    user: user
      ? {
          ...user,
          totalRides,
        }
      : null,
    vehicles: transformedVehicles,
    bookings: bookingsData?.bookings || [],
    loading,
    error,
    refetch: {
      user: fetchProfile,
      vehicles: refetchVehicles,
      bookings: refetchBookings,
    },
  };
};
