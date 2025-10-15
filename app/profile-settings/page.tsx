"use client";

import React, { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import Skeleton from "react-loading-skeleton";

// Lazy load large components to improve page load time
const ProfileHeader = dynamic(
  () => import("@/components/profile/ProfileHeader"),
  {
    ssr: false,
    // loading: () => <Skeleton height={120} />,
  }
);
const PersonalInfoSection = dynamic(
  () => import("@/components/profile/PersonalInfoSection"),
  { ssr: false,  }
);
const VehicleInfoSection = dynamic(
  () => import("@/components/profile/VehicleInfoSection"),
  { ssr: false,  }
);
const PreferencesSection = dynamic(
  () => import("@/components/profile/PreferencesSection"),
  { ssr: false,  }
);
const SafetySection = dynamic(
  () => import("@/components/profile/SafetySection"),
  {
    ssr: false,
    
  }
);
const AccountSecuritySection = dynamic(
  () => import("@/components/profile/AccountSecuritySection"),
  { ssr: false, }
);
const RideHistorySection = dynamic(
  () => import("@/components/profile/RideHistorySection"),
  { ssr: false,}
);
const StatisticsSection = dynamic(
  () => import("@/components/profile/StatisticsSection"),
  { ssr: false,  }
);

const ProfileAccountSettings = () => {
  const [isLoading, setIsLoading] = useState(true);

  // Mock delay for skeleton loading effect
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Mock user data
  const [user, setUser] = useState({
    id: 1,
    name: "Priya Sharma",
    email: "priya.sharma@mitcollege.edu.in",
    phone: "+91 98765 43210",
    college: "MIT College of Engineering, Pune",
    profilePhoto:
      "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face",
    isCollegeVerified: true,
    isDriverVerified: true,
    rating: 4.8,
    totalRides: 127,
    dateOfBirth: "2002-03-15",
    gender: "female",
    emergencyContact: "Rajesh Sharma",
    emergencyPhone: "+91 98765 43211",
    address: "Flat 301, Sunrise Apartments, Kothrud, Pune - 411038",
  });

  const [vehicles, setVehicles] = useState([
    {
      id: 1,
      make: "Honda",
      model: "City",
      year: "2021",
      color: "White",
      licensePlate: "MH12AB1234",
      seats: "5",
      fuelType: "petrol",
      photo:
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=300&h=200&fit=crop",
      isVerified: true,
    },
  ]);

  const [preferences, setPreferences] = useState({
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
  });

  const [safetySettings, setSafetySettings] = useState({
    trustedContacts: [
      {
        id: 1,
        name: "Rajesh Sharma",
        phone: "+91 98765 43211",
        relationship: "father",
      },
      {
        id: 2,
        name: "Anita Sharma",
        phone: "+91 98765 43212",
        relationship: "mother",
      },
    ],
    settings: {
      autoShareRideDetails: true,
      enableLocationTracking: true,
      requireDriverVerification: true,
      safetyCheckIns: true,
    },
  });

  const [securitySettings, setSecuritySettings] = useState({
    twoFactorEnabled: false,
    lastPasswordChange: "2024-07-07",
    loginActivity: [],
  });

  const [rideHistory] = useState([
    {
      id: 1,
      role: "Passenger",
      pickup: "MIT College",
      drop: "Phoenix Mall",
      date: "2024-08-06",
      time: "2:30 PM",
      status: "Completed",
      distance: 8.5,
      duration: "25 min",
      amount: 85,
      rating: 5,
      partner: {
        name: "Arjun Patel",
        avatar:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop&crop=face",
      },
    },
  ]);

  const [statistics] = useState({
    totalRides: 127,
    totalDistance: 2847,
    moneySaved: 8540,
    averageRating: 4.8,
    totalRatings: 89,
    co2Saved: 142,
    fuelSaved: 67,
    treesEquivalent: 6,
    studentsHelped: 23,
    monthlyRides: 18,
    monthlySavings: 1240,
    monthlyDistance: 287,
    monthlyCO2: 18,
    communityScore: 750,
    communityRank: 12,
  });

  const [expandedSections, setExpandedSections] = useState({
    personalInfo: false,
    vehicleInfo: false,
    preferences: false,
    safety: false,
    security: false,
    history: false,
    statistics: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Mock handlers
  const handlePhotoUpload = (file: File) => console.log("Uploaded:", file);
  const handleEditProfile = () =>
    setExpandedSections((prev) => ({ ...prev, personalInfo: true }));
  const handleSavePersonalInfo = (data: any) =>
    setUser((prev) => ({ ...prev, ...data }));
  const handleSavePreferences = (data: any) => setPreferences(data);
  const handleSaveSafetySettings = (data: any) => setSafetySettings(data);
  const handleSaveSecuritySettings = (data: any) => setSecuritySettings(data);

  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <main className="pb-20 md:pb-6">
        <div className="max-w-4xl mx-auto px-4">
          
            <Suspense fallback={<Skeleton height={400} />}>
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
                />

                <VehicleInfoSection
                  vehicles={vehicles.map((v) => ({
                    ...v,
                    id: String(v.id),
                  }))}
                  onAddVehicle={() => {}}
                  onEditVehicle={() => {}}
                  onDeleteVehicle={() => {}}
                  isExpanded={expandedSections.vehicleInfo}
                  onToggle={() => toggleSection("vehicleInfo")}
                />

                <PreferencesSection
                  preferences={preferences}
                  onSave={handleSavePreferences}
                  isExpanded={expandedSections.preferences}
                  onToggle={() => toggleSection("preferences")}
                />

                <SafetySection
                  safetySettings={safetySettings}
                  onSave={handleSaveSafetySettings}
                  isExpanded={expandedSections.safety}
                  onToggle={() => toggleSection("safety")}
                />

                <AccountSecuritySection
                  securitySettings={securitySettings}
                  onSave={() => handleSaveSecuritySettings(securitySettings)}
                  isExpanded={expandedSections.security}
                  onToggle={() => toggleSection("security")}
                />

                <RideHistorySection
                  // @ts-expect-error: 'error' prop is custom for our Input component
                  rideHistory={rideHistory}
                  isExpanded={expandedSections.history}
                  onToggle={() => toggleSection("history")}
                />

                <StatisticsSection
                  statistics={statistics}
                  isExpanded={expandedSections.statistics}
                  onToggle={() => toggleSection("statistics")}
                />
              </div>
            </Suspense>
          
        </div>
      </main>
    </div>
  );
};

export default ProfileAccountSettings;
