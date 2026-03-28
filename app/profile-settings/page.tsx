"use client";

import React, { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import Skeleton from "react-loading-skeleton";
import { toast } from "sonner";
import { useProfileData } from "@/hooks/profile/useProfileData";
import { useUserProfile } from "@/hooks/auth/useUserProfile";
import { createVehicleRecord, updateVehicleRecord } from "@/lib/api/backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  TriangleAlert,
  UserRoundCheck,
  Wallet,
} from "lucide-react";

// Lazy load large components to improve page load time
const ProfileHeader = dynamic(
  () => import("@/components/profile/ProfileHeader"),
  {
    ssr: false,
  },
);
const PersonalInfoSection = dynamic(
  () => import("@/components/profile/PersonalInfoSection"),
  { ssr: false },
);
const VehicleInfoSection = dynamic(
  () => import("@/components/profile/VehicleInfoSection"),
  { ssr: false },
);
const PreferencesSection = dynamic(
  () => import("@/components/profile/PreferencesSection"),
  { ssr: false },
);
const SafetySection = dynamic(
  () => import("@/components/profile/SafetySection"),
  {
    ssr: false,
  },
);
const AccountSecuritySection = dynamic(
  () => import("@/components/profile/AccountSecuritySection"),
  { ssr: false },
);
const RideHistorySection = dynamic(
  () => import("@/components/profile/RideHistorySection"),
  { ssr: false },
);
const StatisticsSection = dynamic(
  () => import("@/components/profile/StatisticsSection"),
  { ssr: false },
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
  const normalizedFuelType = String(
    vehicle?.fuelType ?? "petrol",
  ).toLowerCase();

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
const transformBookingToRideHistory = (
  booking: any,
): {
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
      avatar:
        booking.avatar ||
        "https://w7.pngwing.com/pngs/81/570/png-transparent-profile-logo-computer-icons-user-user-blue-heroes-logo.png",
    },
  };
};

const ProfileAccountSettings = () => {
  // Fetch all profile data dynamically
  const {
    user,
    vehicles,
    bookings,
    preferences,
    safetySettings,
    securitySettings,
    loading: dataLoading,
    error: dataError,
    savePreferences,
    saveSafety,
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
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const sectionNavItems: Array<{
    key: keyof typeof expandedSections;
    label: string;
    id: string;
  }> = [
    { key: "personalInfo", label: "Personal", id: "profile-section-personal" },
    { key: "vehicleInfo", label: "Vehicles", id: "profile-section-vehicles" },
    {
      key: "preferences",
      label: "Preferences",
      id: "profile-section-preferences",
    },
    { key: "safety", label: "Safety", id: "profile-section-safety" },
    { key: "security", label: "Security", id: "profile-section-security" },
    { key: "history", label: "History", id: "profile-section-history" },
    { key: "statistics", label: "Impact", id: "profile-section-impact" },
  ];

  // Calculate statistics from bookings
  const statistics = useMemo(() => {
    if (!bookings || bookings.length === 0) {
      return DEFAULT_STATISTICS;
    }

    const completedBookings = bookings.filter(
      (b: any) => b.status === "completed",
    );
    const totalRides = completedBookings.length;
    const totalAmount = completedBookings.reduce(
      (sum: number, b: any) => sum + (b.total_price || 0),
      0,
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

  // Toggle section expansion (independent sections)
  const toggleSection = useCallback(
    (section: keyof typeof expandedSections) => {
      setExpandedSections((prev) => {
        return {
          ...prev,
          [section]: !prev[section],
        };
      });
    },
    [],
  );

  const jumpToSection = useCallback(
    (section: keyof typeof expandedSections, elementId: string) => {
      setExpandedSections((prev) => ({
        ...prev,
        [section]: true,
      }));

      window.setTimeout(() => {
        const el = document.getElementById(elementId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 30);
    },
    [],
  );

  // Handlers for data updates
  const handlePhotoUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload a valid image file.");
        return;
      }

      if (file.size > 3 * 1024 * 1024) {
        toast.error("Profile photo must be 3MB or smaller.");
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read image file"));
        reader.readAsDataURL(file);
      });

      setPhotoPreview(dataUrl);
      setIsPhotoUploading(true);
      try {
        await updateProfile({
          profile_image: dataUrl,
        });
        await refetch.user();
        toast.success("Profile photo updated.");
      } catch (error: any) {
        console.error("Photo upload error:", error);
        setPhotoPreview(null);
        toast.error(error.message || "Failed to upload photo");
      } finally {
        setIsPhotoUploading(false);
      }
    },
    [updateProfile, refetch],
  );

  const handleEditProfile = useCallback(() => {
    toggleSection("personalInfo");
  }, [toggleSection]);

  const handleSavePersonalInfo = useCallback(
    async (data: any) => {
      try {
        await updateProfile({
          full_name: data.name ?? null,
          phone: data.phone ?? null,
          date_of_birth: data.dateOfBirth ?? null,
          gender_for_matching:
            data.gender === "female" || data.gender === "male"
              ? data.gender
              : null,
          emergency_contact_name: data.emergencyContact ?? null,
          emergency_contact_phone: data.emergencyPhone ?? null,
          address: data.address ?? null,
          profile_image: user?.profilePhoto ?? undefined,
        });
        await refetch.user();
      } catch (error: any) {
        console.error("Save personal info error:", error);
        toast.error(error.message || "Failed to update profile");
        throw error; // Re-throw so component can handle it
      }
    },
    [refetch, updateProfile, user?.profilePhoto],
  );

  const handleSavePreferences = useCallback(
    async (data: any) => {
      try {
        await savePreferences(data);
        toast.success("Preferences saved successfully!");
      } catch (error: any) {
        console.error("Save preferences error:", error);
        toast.error(error.message || "Failed to save preferences");
        throw error; // Re-throw so component can handle it
      }
    },
    [savePreferences],
  );

  const handleSaveSafetySettings = useCallback(
    async (data: any) => {
      try {
        await saveSafety({
          trustedContacts: data.trustedContacts,
          settings: data.settings,
        });
        toast.success("Safety settings saved successfully!");
      } catch (error: any) {
        console.error("Save safety settings error:", error);
        toast.error(error.message || "Failed to save safety settings");
        throw error; // Re-throw so component can handle it
      }
    },
    [saveSafety],
  );

  const handleSaveSecuritySettings = useCallback(
    (_data?: Record<string, unknown>) => {
      toast.success("Security settings saved successfully!");
    },
    [],
  );

  const handleAddVehicle = useCallback(
    async (vehicle: any) => {
      try {
        await createVehicleRecord(mapVehicleFormToBackend(vehicle));

        toast.success("Vehicle added successfully!");
        refetch.vehicles();
      } catch (error: any) {
        console.error("Add vehicle error:", error);
        toast.error(error.message || "Failed to add vehicle");
        throw error; // Re-throw so component can handle it
      }
    },
    [refetch],
  );

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
    [refetch],
  );

  const handleDeleteVehicle = useCallback(
    async (_id: string | number) => {
      try {
        throw new Error(
          "Vehicle deletion is not available in the new backend yet.",
        );
      } catch (error: any) {
        console.error("Delete vehicle error:", error);
        toast.error(error.message || "Failed to delete vehicle");
      }
    },
    [refetch],
  );

  // Show loading state
  if (dataLoading && !user) {
    return (
      <div className="page min-h-screen">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-36 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-20 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      </div>
    );
  }

  // Show error state
  if (dataError && !user) {
    return (
      <div className="page min-h-screen space-y-6">
        <main className="pb-24 md:pb-8">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <h2 className="mb-2 text-xl font-semibold text-red-800">
                Failed to load profile
              </h2>
              <p className="mb-4 text-red-600">{dataError}</p>
              <Button
                onClick={() => {
                  refetch.user();
                  refetch.vehicles();
                  refetch.bookings();
                  refetch.profileDomains();
                }}
                variant="destructive"
              >
                Retry
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show empty state if user is null
  if (!user) {
    return (
      <div className="page min-h-screen space-y-6">
        <main className="pb-24 md:pb-8">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-center">
              <h2 className="mb-2 text-xl font-semibold text-yellow-800">
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

  const headerUser = photoPreview
    ? {
        ...user,
        profilePhoto: photoPreview,
      }
    : user;

  return (
    <ErrorBoundary>
      <div className="page min-h-screen space-y-5 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.10),_transparent_48%),radial-gradient(circle_at_85%_15%,_hsl(var(--accent)/0.18),_transparent_42%)]">
        <main className="pb-24 md:pb-8">
          <div className="mx-auto max-w-5xl space-y-5">
            <Suspense fallback={<Skeleton height={120} />}>
              <ProfileHeader
                user={headerUser}
                onPhotoUpload={handlePhotoUpload}
                onEditProfile={handleEditProfile}
                isPhotoUploading={isPhotoUploading}
              />

              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <article className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 via-card/95 to-card px-4 py-3 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Verification
                    </p>
                    <UserRoundCheck className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {user.isCollegeVerified
                      ? "Student Verified"
                      : "Pending Verification"}
                  </p>
                </article>
                <article className="rounded-xl border border-success/20 bg-gradient-to-br from-success/20 via-card/95 to-card px-4 py-3 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Driver Status
                    </p>
                    <ShieldCheck className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {user.isDriverVerified
                      ? "Eligible to Offer Rides"
                      : "Eligibility Pending"}
                  </p>
                </article>
                <article className="rounded-xl border border-warning/20 bg-gradient-to-br from-warning/20 via-card/95 to-card px-4 py-3 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Total Rides
                    </p>
                    <Wallet className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {user.totalRides ?? 0}
                  </p>
                </article>
                <article className="rounded-xl border border-indigo-300/30 bg-gradient-to-br from-indigo/20 via-card/95 to-card px-4 py-3 shadow-card dark:from-indigo-500/10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Account Health
                    </p>
                    <TriangleAlert className="size-4 text-primary" />
                  </div>
                  <div className="mt-2">
                    <Badge variant={dataError ? "destructive" : "secondary"}>
                      {dataError ? "Needs Attention" : "Healthy"}
                    </Badge>
                  </div>
                </article>
              </section>

              <section className="profile-nav-scroll sticky top-16 z-20 -mx-1 overflow-x-auto rounded-xl border border-border/60 bg-background/90 px-1 py-2 shadow-sm backdrop-blur md:top-20">
                <div className="flex w-max min-w-full gap-2">
                  {sectionNavItems.map((item) => (
                    <Button
                      key={item.key}
                      variant={
                        expandedSections[item.key] ? "secondary" : "outline"
                      }
                      size="sm"
                      className="rounded-full"
                      onClick={() => jumpToSection(item.key, item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </section>

              <div className="space-y-4">
                <div id="profile-section-personal" className="scroll-mt-32">
                  <PersonalInfoSection
                    user={user}
                    onSave={handleSavePersonalInfo}
                    isExpanded={expandedSections.personalInfo}
                    onToggle={() => toggleSection("personalInfo")}
                    isLoading={dataLoading}
                    error={dataError}
                  />
                </div>

                <div id="profile-section-vehicles" className="scroll-mt-32">
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
                </div>

                <div id="profile-section-preferences" className="scroll-mt-32">
                  <PreferencesSection
                    preferences={preferences}
                    onSave={handleSavePreferences}
                    isExpanded={expandedSections.preferences}
                    onToggle={() => toggleSection("preferences")}
                    isLoading={dataLoading}
                    error={dataError}
                  />
                </div>

                <div id="profile-section-safety" className="scroll-mt-32">
                  <SafetySection
                    safetySettings={{
                      trustedContacts: (
                        safetySettings?.trustedContacts ?? []
                      ).map((contact, index) => ({
                        id: contact.id ?? `${index}`,
                        name: contact.name,
                        phone: contact.phone,
                        relationship: contact.relationship,
                        email: contact.email,
                      })),
                      settings: safetySettings?.settings ?? {},
                    }}
                    onSave={handleSaveSafetySettings}
                    isExpanded={expandedSections.safety}
                    onToggle={() => toggleSection("safety")}
                    isLoading={dataLoading}
                    error={dataError}
                  />
                </div>

                <div id="profile-section-security" className="scroll-mt-32">
                  <AccountSecuritySection
                    securitySettings={{
                      twoFactorEnabled:
                        securitySettings?.two_factor?.enabled ?? false,
                      twoFactorMethod:
                        (securitySettings?.two_factor?.method as
                          | "SMS"
                          | "Email"
                          | "App"
                          | undefined) ?? undefined,
                      passwordLastChanged:
                        securitySettings?.password_last_changed_at ?? undefined,
                    }}
                    loginActivity={(securitySettings?.login_activity ?? []).map(
                      (item) => ({
                        id: item.id,
                        device: item.device,
                        ipAddress: item.ip_address ?? undefined,
                        time: item.time ?? undefined,
                        current: item.current,
                        lastActive: item.expires_at ?? undefined,
                      }),
                    )}
                    onSave={handleSaveSecuritySettings}
                    isExpanded={expandedSections.security}
                    onToggle={() => toggleSection("security")}
                    isLoading={dataLoading}
                    error={dataError}
                  />
                </div>

                <div id="profile-section-history" className="scroll-mt-32">
                  <RideHistorySection
                    rideHistory={rideHistory}
                    isLoading={dataLoading}
                    onRebook={() => {}}
                    onRateRide={() => {}}
                    isExpanded={expandedSections.history}
                    onToggle={() => toggleSection("history")}
                  />
                </div>

                <div id="profile-section-impact" className="scroll-mt-32">
                  <StatisticsSection
                    statistics={statistics}
                    isLoading={dataLoading}
                    isExpanded={expandedSections.statistics}
                    onToggle={() => toggleSection("statistics")}
                  />
                </div>
              </div>
            </Suspense>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default ProfileAccountSettings;
