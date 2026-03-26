"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getVerificationOverview } from "@/lib/api/backend";
import { useUserProfile } from "@/hooks/auth/useUserProfile";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  seats: string;
  fuelType: string;
  photo?: string;
  isVerified?: boolean;
  verificationStatus?: string;
}

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

export const useUserVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverEligibilityStatus, setDriverEligibilityStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const overview = await getVerificationOverview();
      setVehicles(overview.vehicles);
      setDriverEligibilityStatus(overview.driverEligibility?.status ?? null);
    } catch (err: any) {
      setError(err?.message || "Error fetching vehicles");
      setVehicles([]);
      setDriverEligibilityStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  return {
    vehicles,
    driverEligibilityStatus,
    loading,
    error,
    refetch: fetchVehicles,
  };
};

const transformUserProfile = (
  user: ReturnType<typeof useUserProfile>["profile"],
  driverEligibilityStatus: string | null,
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
    isDriverVerified: driverEligibilityStatus === "approved",
    rating: user.avg_rating || undefined,
    totalRides: undefined,
  };
};

export const useProfileData = () => {
  const {
    profile: userProfile,
    loading: userLoading,
    error: userError,
    fetchProfile,
  } = useUserProfile();
  const {
    vehicles,
    driverEligibilityStatus,
    loading: vehiclesLoading,
    error: vehiclesError,
    refetch: refetchVehicles,
  } = useUserVehicles();
  const {
    bookingsData,
    loading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useFetchBookings(10);

  const loading = userLoading || vehiclesLoading || bookingsLoading;
  const error = userError || vehiclesError || bookingsError;

  const user = useMemo(() => {
    const transformed = transformUserProfile(userProfile, driverEligibilityStatus);

    if (!transformed) {
      return null;
    }

    return {
      ...transformed,
      totalRides: bookingsData?.bookings?.length || 0,
    };
  }, [userProfile, driverEligibilityStatus, bookingsData]);

  return {
    user,
    vehicles,
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
