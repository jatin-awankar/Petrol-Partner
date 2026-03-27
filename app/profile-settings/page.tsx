"use client";

import React, { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import Skeleton from "react-loading-skeleton";
import { toast } from "sonner";
import { useProfileData } from "@/hooks/profile/useProfileData";
import { useUserProfile } from "@/hooks/auth/useUserProfile";
import { createVehicleRecord, updateVehicleRecord } from "@/lib/api/backend";

// Lazy load large components to improve page load time
const ProfileHeader = dynamic(
  () => import("@/components/profile/ProfileHeader"),
  {
    ssr: false,
  }
);
const PersonalInfoSection = dynamic(
  () => import("@/components/profile/PersonalInfoSection"),
  { ssr: false }
);
const VehicleInfoSection = dynamic(
  () => import("@/components/profile/VehicleInfoSection"),
  { ssr: false }
);
const PreferencesSection = dynamic(
  () => import("@/components/profile/PreferencesSection"),
  { ssr: false }
);
const SafetySection = dynamic(
  () => import("@/components/profile/SafetySection"),
  {
    ssr: false,
  }
);
const AccountSecuritySection = dynamic(
  () => import("@/components/profile/AccountSecuritySection"),
  { ssr: false }
);
const RideHistorySection = dynamic(
  () => import("@/components/profile/RideHistorySection"),
  { ssr: false }
);
const StatisticsSection = dynamic(
  () => import("@/components/profile/StatisticsSection"),
  { ssr: false }
);

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Profile settings error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background container mx-auto p-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-red-800 mb-2">
                Something went wrong
              </h2>
              <p className="text-red-600 mb-4">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Default values for null/undefined data
const DEFAULT_PREFERENCES = {
  musicPreference: "pop",
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
    highRatedUsers: true,
    sameCollege: false,
  },
};

const DEFAULT_SAFETY_SETTINGS = {
  trustedContacts: [],
  settings: {
    autoShareRideDetails: true,
    enableLocationTracking: true,
    requireDriverVerification: true,
    safetyCheckIns: true,
  },
};

const DEFAULT_SECURITY_SETTINGS = {
  twoFactorEnabled: false,
  twoFactorMethod: undefined as "SMS" | "Email" | "App" | undefined,
  lastPasswordChange: undefined as string | undefined,
  loginActivity: [] as Array<{
    id: number | string;
    device: string;
    location?: string;
    time?: string;
    current?: boolean;
    ipAddress?: string;
    lastActive?: string;
  }>,
};

const DEFAULT_STATISTICS = {
  totalRides: 0,
  totalDistance: 0,
  moneySaved: 0,
  averageRating: 0,
  totalRatings: 0,
  co2Saved: 0,
  fuelSaved: 0,
  treesEquivalent: 0,
  studentsHelped: 0,
  monthlyRides: 0,
  monthlySavings: 0,
  monthlyDistance: 0,
  monthlyCO2: 0,
  communityScore: 0,
  communityRank: 0,
};

function mapVehicleFormToBackend(vehicle: any) {
  const licensePlate = String(vehicle?.licensePlate ?? "").trim();
  const normalizedFuelType = String(vehicle?.fuelType ?? "petrol").toLowerCase();

  return {
    vehicle_type:
      normalizedFuelType === "diesel" || normalizedFuelType === "petrol"
        ? "car"
        : normalizedFuelType === "electric"
          ? "car"
          : "other",
    make: vehicle?.make || undefined,
    model: vehicle?.model || undefined,
    color: vehicle?.color || undefined,
    registration_number_last4: licensePlate.slice(-4),
    seat_capacity: Number(vehicle?.seats || 0),
    metadata: {
      year: vehicle?.year || null,
      fuelType: vehicle?.fuelType || null,
      photo: vehicle?.photo || null,
    },
  };
}

// Transform booking data to ride history format
const transformBookingToRideHistory = (booking: any): {
  id: string;
  role: string;
  pickup: string;
  drop: string;
  date: string;
  time: string;
  status: "completed" | "cancelled" | "ongoing";
  distance: number;
  duration: "25 min";
  amount: number;
  rating: number;
  partner: {
    name: string;
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop&crop=face";
  };
} | null => {
  if (!booking) return null;

  return {
    id: booking.booking_id || booking.id || "",
    role: booking.user_role || booking.role || "Passenger",
    pickup: booking.pickup_location || "Unknown",
    drop: booking.drop_location || "Unknown",
    date: booking.date || new Date().toISOString().split("T")[0],
    time: booking.time || "12:00 PM",
    status: (booking.status || "completed").toLowerCase() as
      | "completed"
      | "cancelled"
      | "ongoing",
    distance: 0, // Not available in booking data
    duration: "25 min",
    amount: booking.total_price || booking.price_per_seat || 0,
    rating: 0, // Not available in booking data
    partner: {
      name: booking.other_user_name || "Unknown",
      avatar: booking.avatar || "https://w7.pngwing.com/pngs/81/570/png-transparent-profile-logo-computer-icons-user-user-blue-heroes-logo.png",
    },
  };
};

const ProfileAccountSettings = () => {
  // Fetch all profile data dynamically
  const {
    user,
    vehicles,
    bookings,
    loading: dataLoading,
    error: dataError,
    refetch,
  } = useProfileData();
  const { updateProfile } = useUserProfile();

  // Local state for UI interactions
  const [expandedSections, setExpandedSections] = useState({
    personalInfo: false,
    vehicleInfo: false,
    preferences: false,
    safety: false,
    security: false,
    history: false,
    statistics: false,
  });

  // Local state for settings that might not be in API yet
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [safetySettings, setSafetySettings] = useState(DEFAULT_SAFETY_SETTINGS);
  const [securitySettings, setSecuritySettings] = useState(
    DEFAULT_SECURITY_SETTINGS
  );

  // Calculate statistics from bookings
  const statistics = useMemo(() => {
    if (!bookings || bookings.length === 0) {
      return DEFAULT_STATISTICS;
    }

    const completedBookings = bookings.filter(
      (b: any) => b.status === "completed"
    );
    const totalRides = completedBookings.length;
    const totalAmount = completedBookings.reduce(
      (sum: number, b: any) => sum + (b.total_price || 0),
      0
    );

    return {
      ...DEFAULT_STATISTICS,
      totalRides,
      moneySaved: totalAmount,
      monthlyRides: completedBookings.filter((b: any) => {
        const bookingDate = new Date(b.created_at || b.date);
        const now = new Date();
        return (
          bookingDate.getMonth() === now.getMonth() &&
          bookingDate.getFullYear() === now.getFullYear()
        );
      }).length,
    };
  }, [bookings]);

  // Transform bookings to ride history format
  const rideHistory = useMemo(() => {
    if (!bookings || bookings.length === 0) return [];
    return bookings
      .map(transformBookingToRideHistory)
      .filter((ride): ride is NonNullable<typeof ride> => ride !== null);
  }, [bookings]);

  // Toggle section expansion (only one section open at a time)
  const toggleSection = useCallback(
    (section: keyof typeof expandedSections) => {
      setExpandedSections((prev) => {
        // Close all sections first
        const allClosed = Object.keys(prev).reduce(
          (acc, key) => ({ ...acc, [key]: false }),
          {} as typeof prev
        );

        // Toggle only the clicked section
        return {
          ...allClosed,
          [section]: !prev[section],
        };
      });
    },
    []
  );

  // Handlers for data updates
  const handlePhotoUpload = useCallback(
    async (_file: File) => {
      try {
        throw new Error("Profile photo upload is not available in the new backend yet.");
      } catch (error: any) {
        console.error("Photo upload error:", error);
        toast.error(error.message || "Failed to upload photo");
      }
    },
    [updateProfile, refetch]
  );

  const handleEditProfile = useCallback(() => {
    toggleSection("personalInfo");
  }, [toggleSection]);

  const handleSavePersonalInfo = useCallback(
    async (_data: any) => {
      try {
        await updateProfile();
      } catch (error: any) {
        console.error("Save personal info error:", error);
        toast.error(error.message || "Failed to update profile");
        throw error; // Re-throw so component can handle it
      }
    },
    [updateProfile, refetch]
  );

  const handleSavePreferences = useCallback(async (data: any) => {
    try {
      setPreferences(data);
      // TODO: Save to API when endpoint is available
      // await fetch('/api/user/preferences', { method: 'POST', body: JSON.stringify(data) });
      toast.success("Preferences saved successfully!");
    } catch (error: any) {
      console.error("Save preferences error:", error);
      toast.error(error.message || "Failed to save preferences");
      throw error; // Re-throw so component can handle it
    }
  }, []);

  const handleSaveSafetySettings = useCallback(async (data: any) => {
    try {
      setSafetySettings(data);
      // TODO: Save to API when endpoint is available
      // await fetch('/api/user/safety-settings', { method: 'POST', body: JSON.stringify(data) });
      toast.success("Safety settings saved successfully!");
    } catch (error: any) {
      console.error("Save safety settings error:", error);
      toast.error(error.message || "Failed to save safety settings");
      throw error; // Re-throw so component can handle it
    }
  }, []);

  const handleSaveSecuritySettings = useCallback((data?: Partial<typeof DEFAULT_SECURITY_SETTINGS>) => {
    if (data) {
      setSecuritySettings((prev) => ({
        ...prev,
        ...data,
      }));
    }
    // TODO: Save to API when endpoint is available
    toast.success("Security settings saved successfully!");
  }, []);

  const handleAddVehicle = useCallback(async (vehicle: any) => {
    try {
      await createVehicleRecord(mapVehicleFormToBackend(vehicle));

      toast.success("Vehicle added successfully!");
      refetch.vehicles();
    } catch (error: any) {
      console.error("Add vehicle error:", error);
      toast.error(error.message || "Failed to add vehicle");
      throw error; // Re-throw so component can handle it
    }
  }, [refetch]);

  const handleEditVehicle = useCallback(
    async (id: string | number, vehicle: any) => {
      try {
        await updateVehicleRecord(String(id), mapVehicleFormToBackend(vehicle));

        toast.success("Vehicle updated successfully!");
        refetch.vehicles();
      } catch (error: any) {
        console.error("Edit vehicle error:", error);
        toast.error(error.message || "Failed to update vehicle");
        throw error; // Re-throw so component can handle it
      }
    },
    [refetch]
  );

  const handleDeleteVehicle = useCallback(
    async (_id: string | number) => {
      try {
        throw new Error("Vehicle deletion is not available in the new backend yet.");
      } catch (error: any) {
        console.error("Delete vehicle error:", error);
        toast.error(error.message || "Failed to delete vehicle");
      }
    },
    [refetch]
  );

  // Show loading state
  if (dataLoading) {
    return (
      <div className="page min-h-screen bg-background container flex mx-auto p-4 items-center">
          <div className="max-w-4xl mx-auto">
            Loading profile-settings...
          </div>
      </div>
    );
  }

  // Show error state
  if (dataError && !user) {
    return (
      <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
        <main className="pb-20 md:pb-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-red-800 mb-2">
                Failed to load profile
              </h2>
              <p className="text-red-600 mb-4">{dataError}</p>
              <button
                onClick={() => {
                  refetch.user();
                  refetch.vehicles();
                  refetch.bookings();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show empty state if user is null
  if (!user) {
    return (
      <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
        <main className="pb-20 md:pb-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                No profile found
              </h2>
              <p className="text-yellow-600">
                Please log in to view your profile settings.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
        <main className="pb-20 md:pb-6">
          <div className="max-w-4xl mx-auto">
            <Suspense fallback={<Skeleton height={100} />}>
              <ProfileHeader
                user={user}
                onPhotoUpload={handlePhotoUpload}
                onEditProfile={handleEditProfile}
              />

              <div className="space-y-0">
                <PersonalInfoSection
                  user={user}
                  onSave={handleSavePersonalInfo}
                  isExpanded={expandedSections.personalInfo}
                  onToggle={() => toggleSection("personalInfo")}
                  isLoading={dataLoading}
                  error={dataError}
                />

                <VehicleInfoSection
                  vehicles={vehicles ?? null}
                  onAddVehicle={handleAddVehicle}
                  onEditVehicle={handleEditVehicle}
                  onDeleteVehicle={handleDeleteVehicle}
                  isExpanded={expandedSections.vehicleInfo}
                  onToggle={() => toggleSection("vehicleInfo")}
                  isLoading={dataLoading}
                  error={dataError}
                />

                <PreferencesSection
                  preferences={preferences}
                  onSave={handleSavePreferences}
                  isExpanded={expandedSections.preferences}
                  onToggle={() => toggleSection("preferences")}
                  isLoading={dataLoading}
                  error={dataError}
                />

                <SafetySection
                  safetySettings={safetySettings}
                  onSave={handleSaveSafetySettings}
                  isExpanded={expandedSections.safety}
                  onToggle={() => toggleSection("safety")}
                  isLoading={dataLoading}
                  error={dataError}
                />

                <AccountSecuritySection
                  securitySettings={{
                    twoFactorEnabled: securitySettings.twoFactorEnabled,
                    twoFactorMethod: securitySettings.twoFactorMethod,
                    passwordLastChanged: securitySettings.lastPasswordChange,
                  }}
                  loginActivity={securitySettings.loginActivity}
                  onSave={handleSaveSecuritySettings}
                  isExpanded={expandedSections.security}
                  onToggle={() => toggleSection("security")}
                  isLoading={dataLoading}
                  error={dataError}
                />

                <RideHistorySection
                  rideHistory={rideHistory}
                  isLoading={dataLoading}
                  onRebook={() => {}}
                  onRateRide={() => {}}
                  isExpanded={expandedSections.history}
                  onToggle={() => toggleSection("history")}
                />

                <StatisticsSection
                  statistics={statistics}
                  isLoading={dataLoading}
                  isExpanded={expandedSections.statistics}
                  onToggle={() => toggleSection("statistics")}
                />
              </div>
            </Suspense>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default ProfileAccountSettings;
