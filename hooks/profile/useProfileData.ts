"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getProfilePreferences,
  getProfileSafety,
  getProfileSecurity,
  getVerificationOverview,
  updateProfilePreferences,
  updateProfileSafety,
  type BackendProfilePreferences,
  type BackendProfileSafety,
  type BackendProfileSecurity,
} from "@/lib/api/backend";
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

const DEFAULT_PREFERENCES: BackendProfilePreferences = {
  musicPreference: "any",
  smokingPolicy: "no-smoking",
  chattiness: "moderate",
  notifications: {
    rideMatches: true,
    messages: true,
    payments: true,
    promotions: false,
  },
  privacy: {
    showProfile: true,
    shareRideHistory: true,
    shareLocation: true,
  },
  autoAccept: {
    highRatedUsers: false,
    sameCollege: false,
  },
};

const DEFAULT_SAFETY: BackendProfileSafety = {
  trustedContacts: [],
  settings: {
    autoShareRideDetails: true,
    enableLocationTracking: true,
    requireDriverVerification: true,
    safetyCheckIns: true,
  },
};

const DEFAULT_SECURITY: BackendProfileSecurity = {
  password_last_changed_at: null,
  two_factor: {
    enabled: false,
    method: null,
    supported: false,
  },
  login_activity: [],
};

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
    dateOfBirth: user.date_of_birth || undefined,
    gender: user.gender_for_matching || undefined,
    emergencyContact: user.emergency_contact_name || undefined,
    emergencyPhone: user.emergency_contact_phone || undefined,
    address: user.address || undefined,
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

  const [preferences, setPreferences] = useState<BackendProfilePreferences>(DEFAULT_PREFERENCES);
  const [safetySettings, setSafetySettings] = useState<BackendProfileSafety>(DEFAULT_SAFETY);
  const [securitySettings, setSecuritySettings] = useState<BackendProfileSecurity>(DEFAULT_SECURITY);
  const [profileDomainLoading, setProfileDomainLoading] = useState(true);
  const [profileDomainError, setProfileDomainError] = useState<string | null>(null);

  const fetchProfileDomains = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setProfileDomainLoading(true);
    }
    setProfileDomainError(null);

    try {
      const [nextPreferences, nextSafety, nextSecurity] = await Promise.all([
        getProfilePreferences(),
        getProfileSafety(),
        getProfileSecurity(),
      ]);

      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...nextPreferences,
        notifications: {
          ...DEFAULT_PREFERENCES.notifications,
          ...(nextPreferences.notifications ?? {}),
        },
        privacy: {
          ...DEFAULT_PREFERENCES.privacy,
          ...(nextPreferences.privacy ?? {}),
        },
        autoAccept: {
          ...DEFAULT_PREFERENCES.autoAccept,
          ...(nextPreferences.autoAccept ?? {}),
        },
      });
      setSafetySettings({
        trustedContacts: nextSafety.trustedContacts ?? DEFAULT_SAFETY.trustedContacts,
        settings: {
          ...DEFAULT_SAFETY.settings,
          ...(nextSafety.settings ?? {}),
        },
      });
      setSecuritySettings({
        ...DEFAULT_SECURITY,
        ...nextSecurity,
        two_factor: {
          ...DEFAULT_SECURITY.two_factor,
          ...(nextSecurity.two_factor ?? {}),
        },
        login_activity: Array.isArray(nextSecurity.login_activity)
          ? nextSecurity.login_activity
          : [],
      });
    } catch (err: any) {
      setProfileDomainError(err?.message || "Error loading profile settings");
      setPreferences(DEFAULT_PREFERENCES);
      setSafetySettings(DEFAULT_SAFETY);
      setSecuritySettings(DEFAULT_SECURITY);
    } finally {
      if (!silent) {
        setProfileDomainLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchProfileDomains();
  }, [fetchProfileDomains]);

  useEffect(() => {
    const onFocus = () => {
      void fetchProfileDomains({ silent: true });
      void fetchProfile().catch(() => undefined);
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchProfile, fetchProfileDomains]);

  const savePreferences = useCallback(async (input: BackendProfilePreferences) => {
    const next = await updateProfilePreferences(input);
    setPreferences({
      ...DEFAULT_PREFERENCES,
      ...next,
      notifications: {
        ...DEFAULT_PREFERENCES.notifications,
        ...(next.notifications ?? {}),
      },
      privacy: {
        ...DEFAULT_PREFERENCES.privacy,
        ...(next.privacy ?? {}),
      },
      autoAccept: {
        ...DEFAULT_PREFERENCES.autoAccept,
        ...(next.autoAccept ?? {}),
      },
    });
  }, []);

  const saveSafety = useCallback(async (input: BackendProfileSafety) => {
    const next = await updateProfileSafety(input);
    setSafetySettings({
      trustedContacts: next.trustedContacts ?? [],
      settings: {
        ...DEFAULT_SAFETY.settings,
        ...(next.settings ?? {}),
      },
    });
  }, []);

  const loading = userLoading || vehiclesLoading || bookingsLoading || profileDomainLoading;
  const error = userError || vehiclesError || bookingsError || profileDomainError;

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
    preferences,
    safetySettings,
    securitySettings,
    loading,
    error,
    savePreferences,
    saveSafety,
    refetch: {
      user: fetchProfile,
      vehicles: refetchVehicles,
      bookings: refetchBookings,
      profileDomains: fetchProfileDomains,
    },
  };
};
