// app/rides/[rideId]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import DriverProfile from "@/components/rides/DriverProfile";
import RouteMap from "@/components/rides/RouteMap";
import RideInformation from "@/components/rides/RideInformation";
import DriverPreferences from "@/components/rides/DriverPreferences";
import BookingSection from "@/components/rides/BookingSection";
import SafetyPanel from "@/components/rides/SafetyPanel";
import BookingConfirmationModal from "@/components/rides/BookingConfirmationModal";
import EmergencyAccessButton from "@/components/ui/EmergencyAccessButton";

export default function RideDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken, isLoaded } = useAuth();
  const [ride, setRide] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const rideId = params?.rideId;

  useEffect(() => {
    if (!rideId) return;
    let mounted = true;

    const fetchRide = async () => {
      setLoading(true);
      try {
        // If you need auth on server route, supply Clerk token
        const token = await getToken();
        const res = await fetch(`/api/rides/${rideId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error("Failed to fetch ride");
        const data = await res.json();
        if (mounted) setRide(data);
      } catch (err) {
        console.error("fetchRide error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchRide();

    return () => {
      mounted = false;
    };
  }, [rideId, getToken]);

  // Booking modal state is managed inside BookingSection / BookingConfirmationModal
  return (
    <div className="min-h-screen bg-background">

      <main className="pt-16 pb-20 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <button className="btn-ghost" onClick={() => router.back()}>
              Back
            </button>
            <button className="btn-outline" onClick={() => { navigator.share?.({ title: "Ride", url: location.href }) }}>
              Share
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <DriverProfile driver={ride?.driver} loading={loading} />
              <RouteMap route={ride ? {
                pickup: { address: ride.origin_address, lat: ride.origin_lat, lng: ride.origin_lng },
                dropoff: { address: ride.destination_address, lat: ride.destination_lat, lng: ride.destination_lng }
              } : null} />
              <RideInformation ride={ride} />
              <DriverPreferences preferences={ride?.driver?.preferences ?? null} />

              <div className="lg:hidden">
                <BookingSection ride={ride} />
              </div>

              <div className="lg:hidden">
                <SafetyPanel />
              </div>
            </div>

            <div className="hidden lg:block space-y-6">
              <BookingSection ride={ride} />
              <SafetyPanel />
            </div>
          </div>
        </div>
      </main>

      <BookingConfirmationModal />
      <EmergencyAccessButton />
    </div>
  );
}
