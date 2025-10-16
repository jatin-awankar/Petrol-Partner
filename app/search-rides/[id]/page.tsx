"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share } from "lucide-react";
import EmergencyAccessButton from "@/components/ui/EmergencyAccessButton";

// Components
import ProfileInfo from "@/components/rideDetails/ProfileInfo";
import RouteMap from "@/components/rideDetails/RouteMap";
import BookingSection from "@/components/rideDetails/BookingSection";
import RideInformation from "@/components/rideDetails/RideInformation";
import DriverPreferences from "@/components/rideDetails/DriverPreferences";
import SafetyPanel from "@/components/rideDetails/SafetyPanel";
import BookingConfirmationModal from "@/components/rideDetails/BookingConfirmationModal";
import { motion } from "framer-motion";

const RideDetailsPage = () => {
  const { id } = useParams();
  const router = useRouter();

  const [rideData, setRideData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [bookingData, setBookingData] = useState<any>(null);
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  // --- Fetch ride data ---
  useEffect(() => {
    const fetchRideData = async () => {
      try {
        setLoading(true);
        setError(null);

        // TODO: Replace with Supabase fetch
        const mockRide = {
          id: "ride_001",
          type: "offer", // or 'request'
          driver: {
            id: "driver_001",
            name: "Arjun Sharma",
            avatar:
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
            college: "IIT Delhi",
            year: "3rd Year, Computer Science",
            rating: 4.8,
            reviewCount: 127,
            totalRides: 89,
            joinedDate: "Jan 2023",
            isVerified: true,
            bio: "Friendly driver who loves music and good conversations.",
          },
          route: {
            pickup: {
              name: "IIT Delhi Main Gate",
              address: "Hauz Khas, New Delhi, Delhi 110016",
              lat: 28.5449,
              lng: 77.1928,
            },
            dropoff: {
              name: "Connaught Place",
              address: "Connaught Place, New Delhi, Delhi 110001",
              lat: 28.6315,
              lng: 77.2167,
            },
            duration: "35 mins",
            distance: "12.5 km",
            pickupTime: "09:15 AM",
            dropoffTime: "09:50 AM",
          },
          date: "Today, Jan 8",
          availableSeats: 3,
          totalSeats: 4,
          baseFare: 80,
          fuelShare: 45,
          platformFee: 15,
          totalPrice: 125,
          vehicle: {
            make: "Maruti Suzuki",
            model: "Swift",
            year: "2021",
            color: "White",
            plateNumber: "DL 8C AB 1234",
            image:
              "https://images.unsplash.com/photo-1549399736-8e8c2e2b5b5e?w=200&h=150&fit=crop",
          },
          safetyFeatures: [
            "GPS Tracking",
            "Emergency Button",
            "Driver Verification",
          ],
          preferences: {
            music: "Bollywood & Pop",
            conversation: "Moderate",
            pets: "Not allowed",
            smoking: "No smoking",
          },
          passenger: {},
        };

        setRideData(mockRide);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message || "Failed to load ride data."
            : "Failed to load ride data."
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchRideData();
  }, [id]);

  // --- Booking Logic ---
  const handleBookRide = (bookingDetails: Record<string, unknown>) => {
    const fullBookingData = {
      ...bookingDetails,
      route: {
        pickup: rideData?.route?.pickup?.name,
        dropoff: rideData?.route?.dropoff?.name,
      },
      date: rideData?.date,
      driverName: rideData?.driver?.name,
    };

    setBookingData(fullBookingData);
    setShowConfirmationModal(true);
  };

  const handleConfirmBooking = async () => {
    setIsBookingLoading(true);
    try {
      await new Promise((res) => setTimeout(res, 1500));
      setShowConfirmationModal(false);
      alert("Booking request sent! Awaiting confirmation.");
      router.push("/dashboard");
    } catch {
      alert("Failed to confirm booking.");
    } finally {
      setIsBookingLoading(false);
    }
  };

  // --- Emergency actions ---
  const handleEmergencyCall = () => (window.location.href = "tel:911");
  const handleShareLocation = () => alert("Location shared with contacts.");
  const handleContactSupport = () => alert("Contacting support...");

  // --- Error UI ---
  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive font-semibold">{error}</p>
        <Button onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <main>
        <div className="max-w-7xl mx-auto">
          {/* Header Actions */}
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-row items-center justify-between mb-6"
          >
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft /> Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: "Petrol Partner Ride",
                    text: `Check this ride from ${rideData?.route?.pickup?.name} to ${rideData?.route?.dropoff?.name}`,
                    url: window.location.href,
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Ride link copied!");
                }
              }}
            >
              <Share /> Share
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              <ProfileInfo
                profile={
                  rideData?.type === "offer"
                    ? rideData?.driver ?? {}
                    : rideData?.passenger ?? {}
                }
                role={rideData?.type === "offer" ? "driver" : "passenger"}
              />

              <RouteMap route={rideData?.route} />
              <RideInformation ride={rideData} />
              <DriverPreferences preferences={rideData?.preferences} />

              {/* Mobile Booking */}
              <div className="lg:hidden mb-6">
                <BookingSection ride={rideData} onBookRide={handleBookRide} />
              </div>
            </div>

            {/* Right Column */}
            <div className="hidden lg:block space-y-6">
              <BookingSection ride={rideData} onBookRide={handleBookRide} />
              <SafetyPanel
                onEmergencyContact={handleEmergencyCall}
                onShareLocation={handleShareLocation}
                onReportIssue={handleContactSupport}
              />
            </div>
          </motion.div>
        </div>
      </main>

      {/* Booking Modal */}
      <BookingConfirmationModal
        isOpen={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        bookingData={bookingData}
        onConfirm={handleConfirmBooking}
        isLoading={isBookingLoading}
      />

      {/* Floating Emergency Button */}
      <EmergencyAccessButton
        onEmergencyCall={handleEmergencyCall}
        onShareLocation={handleShareLocation}
        onContactSupport={handleContactSupport}
      />
    </div>
  );
};

export default RideDetailsPage;
