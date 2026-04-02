"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share } from "lucide-react";
import EmergencyAccessButton from "@/components/ui/EmergencyAccessButton";
import { motion } from "framer-motion";

// Components
import ProfileInfo from "@/components/rideDetails/ProfileInfo";
import RouteMap from "@/components/rideDetails/RouteMap";
import BookingSection from "@/components/rideDetails/BookingSection";
import RideInformation from "@/components/rideDetails/RideInformation";
import DriverPreferences from "@/components/rideDetails/DriverPreferences";
import SafetyPanel from "@/components/rideDetails/SafetyPanel";
import BookingConfirmationModal from "@/components/rideDetails/BookingConfirmationModal";
import { useBookRide } from "@/hooks/bookings/useBookRide";
import { formatUtcToTodayOrDayMonth } from "@/lib/utils";
import { toast } from "sonner";
import { getRideOffer, getRideRequest } from "@/lib/api/backend";

// Types
interface RideData {
  id: string;
  type: "offer" | "request";
  driver?: {
    id: string;
    name: string;
    avatar?: string;
    college?: string;
    year?: string;
    rating?: number;
    reviewCount?: number;
    totalRides?: number;
    joinedDate?: string;
    isVerified?: boolean;
    bio?: string;
  };
  passenger?: {
    id: string;
    name: string;
    avatar?: string;
    college?: string;
    year?: string;
    rating?: number;
    reviewCount?: number;
    totalRides?: number;
    joinedDate?: string;
    isVerified?: boolean;
    bio?: string;
  };
  route?: {
    pickup: {
      name: string;
      address: string;
      lat: number;
      lng: number;
    };
    dropoff: {
      name: string;
      address: string;
      lat: number;
      lng: number;
    };
    duration?: string;
    distance?: string;
    pickupTime?: string;
    dropoffTime?: string;
  };
  date?: string;
  availableSeats?: number;
  totalSeats?: number;
  seats_required?: number;
  baseFare?: number;
  fuelShare?: number;
  platformFee?: number;
  totalPrice?: number;
  price_per_seat?: number;
  vehicle?: {
    make?: string;
    model?: string;
    year?: string;
    color?: string;
    plateNumber?: string;
    image?: string;
  };
  vehicle_details?: any;
  safetyFeatures?: string[];
  preferences?: {
    music?: string;
    conversation?: string;
    pets?: string;
    smoking?: string;
  };
}

// Transform API response to component format
const transformRideOffer = (apiData: any): RideData => {
  let vehicleDetails: any = {};
  try {
    vehicleDetails = apiData.vehicle_details
      ? typeof apiData.vehicle_details === "string"
        ? JSON.parse(apiData.vehicle_details)
        : apiData.vehicle_details
      : {};
  } catch (e) {
    console.warn("Failed to parse vehicle_details:", e);
    vehicleDetails = {};
  }

  const pricePerSeat = parseFloat(apiData.price_per_seat || "0");
  const baseFare = pricePerSeat * 0.7;
  const fuelShare = pricePerSeat * 0.25;
  const platformFee = Math.max(pricePerSeat * 0.05, 15);
  const joinedAt = formatUtcToTodayOrDayMonth(apiData.created_at || "");

  return {
    id: apiData.id,
    type: "offer",
    driver: {
      id: apiData.driver_id,
      name: apiData.driver_name || apiData.full_name || "Unknown Driver",
      avatar: apiData.driver_image || apiData.profile_image,
      college: apiData.driver_college || apiData.college,
      rating: parseFloat(apiData.driver_rating || apiData.avg_rating || "0"),
      reviewCount: apiData.driver_review_count || 0,
      isVerified:
        apiData.driver_is_verified !== undefined
          ? apiData.driver_is_verified
          : apiData.is_verified || false,
      joinedDate: joinedAt || undefined,
      totalRides:
        parseInt(apiData.total_rides || apiData.totalRides || "0", 10) || 0,
    },
    route: {
      pickup: {
        name: apiData.pickup_location || "Pickup Location",
        address: apiData.pickup_location || "",
        lat: parseFloat(apiData.pickup_lat || "0"),
        lng: parseFloat(apiData.pickup_lng || "0"),
      },
      dropoff: {
        name: apiData.drop_location || "Drop Location",
        address: apiData.drop_location || "",
        lat: parseFloat(apiData.drop_lat || "0"),
        lng: parseFloat(apiData.drop_lng || "0"),
      },
      pickupTime: apiData.time || "",
    },
    date: apiData.date || "",
    availableSeats: parseInt(apiData.available_seats || "0", 10),
    totalSeats: parseInt(apiData.available_seats || "0", 10),
    price_per_seat: pricePerSeat,
    totalPrice: pricePerSeat,
    baseFare: baseFare,
    fuelShare: fuelShare,
    platformFee: platformFee,
    vehicle: {
      make: vehicleDetails.make || vehicleDetails.make_model?.split(" ")[0],
      model:
        vehicleDetails.model ||
        vehicleDetails.make_model?.split(" ").slice(1).join(" "),
      year: vehicleDetails.year,
      color: vehicleDetails.color,
      plateNumber: vehicleDetails.plate_number || vehicleDetails.plateNumber,
      image: vehicleDetails.image,
    },
    preferences: vehicleDetails.preferences || {},
    safetyFeatures: ["GPS Tracking", "Emergency Button", "Driver Verification"],
  };
};

const transformRideRequest = (apiData: any): RideData => {
  const pricePerSeat = parseFloat(
    apiData.price_per_seat || apiData.price_offer || "0",
  );
  const baseFare = pricePerSeat * 0.7;
  const fuelShare = pricePerSeat * 0.25;
  const platformFee = Math.max(pricePerSeat * 0.05, 15);
  const joinedAt = formatUtcToTodayOrDayMonth(apiData.created_at || "");

  return {
    id: apiData.id,
    type: "request",
    passenger: {
      id: apiData.passenger_id,
      name: apiData.passenger_name || apiData.full_name || "Unknown Passenger",
      avatar: apiData.passenger_image || apiData.profile_image,
      college: apiData.passenger_college || apiData.college,
      rating: parseFloat(apiData.passenger_rating || apiData.avg_rating || "0"),
      reviewCount: apiData.passenger_review_count || 0,
      isVerified:
        apiData.passenger_is_verified !== undefined
          ? apiData.passenger_is_verified
          : apiData.is_verified || false,
      joinedDate: joinedAt || undefined,
      totalRides:
        parseInt(apiData.total_rides || apiData.totalRides || "0", 10) || 0,
    },
    route: {
      pickup: {
        name: apiData.pickup_location || "Pickup Location",
        address: apiData.pickup_location || "",
        lat: parseFloat(apiData.pickup_lat || "0"),
        lng: parseFloat(apiData.pickup_lng || "0"),
      },
      dropoff: {
        name: apiData.drop_location || "Drop Location",
        address: apiData.drop_location || "",
        lat: parseFloat(apiData.drop_lat || "0"),
        lng: parseFloat(apiData.drop_lng || "0"),
      },
      pickupTime: apiData.time || "",
    },
    date: apiData.date || "",
    seats_required: parseInt(apiData.seats_required || "1", 10),
    availableSeats: parseInt(apiData.seats_required || "1", 10),
    totalSeats: parseInt(apiData.seats_required || "1", 10),
    price_per_seat: pricePerSeat,
    totalPrice: pricePerSeat,
    baseFare: baseFare,
    fuelShare: fuelShare,
    platformFee: platformFee,
    safetyFeatures: [
      "GPS Tracking",
      "Emergency Button",
      "Passenger Verification",
    ],
  };
};

const RideDetailsPage = () => {
  const { id } = useParams();
  const router = useRouter();
  const { bookRide, loading: isBookingLoading } = useBookRide();

  const [rideData, setRideData] = useState<RideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [bookingData, setBookingData] = useState<any>(null);

  // Fetch ride data - try both offer and request endpoints
  const fetchRideData = useCallback(async () => {
    // Handle both string and array cases from useParams
    const rideId = Array.isArray(id) ? id[0] : id;

    if (!rideId || typeof rideId !== "string") {
      console.error("Invalid ride ID:", id);
      setError("Invalid ride ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("Fetching ride with ID:", rideId);

      let offerData: any = null;

      try {
        offerData = await getRideOffer(rideId);
      } catch (offerError: any) {
        if (offerError?.status && offerError.status !== 404) {
          throw offerError;
        }
      }

      if (offerData?.driver_id) {
        setRideData(transformRideOffer(offerData));
        setLoading(false);
        return;
      }

      let requestData: any = null;

      try {
        requestData = await getRideRequest(rideId);
      } catch (requestError: any) {
        if (requestError?.status && requestError.status !== 404) {
          throw requestError;
        }
      }

      if (requestData?.passenger_id) {
        setRideData(transformRideRequest(requestData));
        setLoading(false);
        return;
      }

      // If neither worked, show error
      setError(
        "Ride not found. The ride may have been removed or the ID is invalid.",
      );
    } catch (err) {
      console.error("Error fetching ride data:", err);
      setError(
        err instanceof Error
          ? err.message || "Failed to load ride data."
          : "Failed to load ride data.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRideData();
  }, [fetchRideData]);

  // Booking Logic
  const handleBookRide = useCallback(
    (bookingDetails: Record<string, unknown>) => {
      if (!rideData) return;

      const fullBookingData = {
        ...bookingDetails,
        ride_offer_id: rideData.type === "offer" ? rideData.id : undefined,
        ride_request_id: rideData.type === "request" ? rideData.id : undefined,
        route: {
          pickup: rideData.route?.pickup?.name,
          dropoff: rideData.route?.dropoff?.name,
        },
        date: rideData.date,
        driverName:
          rideData.type === "offer"
            ? rideData.driver?.name
            : rideData.passenger?.name,
      };

      setBookingData(fullBookingData);
      setShowConfirmationModal(true);
    },
    [rideData],
  );

  const handleConfirmBooking = useCallback(async () => {
    if (!bookingData) return;

    try {
      const result = await bookRide({
        ride_offer_id: bookingData.ride_offer_id,
        ride_request_id: bookingData.ride_request_id,
        seats_booked: bookingData.seats || 1,
        payment_method: bookingData.paymentMethod || "cash",
      });

      if (result) {
        setShowConfirmationModal(false);
        toast.success("Booking request sent successfully");
        router.push("/dashboard");
      }
    } catch (err) {
      console.error("Booking error:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to complete booking",
      );
    }
  }, [bookingData, bookRide, router]);

  // Emergency actions
  const handleEmergencyCall = useCallback(
    () => (window.location.href = "tel:911"),
    [],
  );
  const handleShareLocation = useCallback(
    () => alert("Location shared with contacts."),
    [],
  );
  const handleContactSupport = useCallback(
    () => alert("Contacting support..."),
    [],
  );

  // Share functionality
  const handleShare = useCallback(() => {
    if (!rideData) return;

    const shareData = {
      title: "Petrol Partner Ride",
      text: `Check this ride from ${rideData.route?.pickup?.name} to ${rideData.route?.dropoff?.name}`,
      url: window.location.href,
    };

    if (navigator.share) {
      navigator.share(shareData).catch((err) => {
        console.error("Share error:", err);
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Ride link copied!");
    }
  }, [rideData]);

  // Loading state
  if (loading) {
    return (
      <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading ride details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !rideData) {
    return (
      <div className="page min-h-screen bg-background container mx-auto p-4">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <p className="text-destructive font-semibold text-lg mb-4">
            {error || "Ride not found"}
          </p>
          <Button onClick={() => router.back()} variant="outline">
            <ArrowLeft className="mr-2" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Main Render
  return (
    <div className="min-h-screen pb-16 md:pb-8 bg-gradient-hero">
      <main className="page mx-auto space-y-6">
        <div className="max-w-7xl mx-auto">
          {/* Header Actions */}
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-row items-center justify-between mb-6"
          >
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-2" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share className="mr-2" /> Share
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
                  rideData.type === "offer"
                    ? (rideData.driver ?? {})
                    : (rideData.passenger ?? {})
                }
                role={rideData.type === "offer" ? "driver" : "passenger"}
                loading={loading}
              />

              <RouteMap route={rideData.route} />
              <RideInformation ride={rideData} />
              {rideData.type === "offer" && (
                <DriverPreferences preferences={rideData.preferences} />
              )}

              {/* Mobile Booking */}
              <div className="lg:hidden">
                <BookingSection
                  ride={rideData}
                  role={rideData.type === "offer" ? "passenger" : "driver"}
                  onBookRide={handleBookRide}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="hidden lg:block space-y-6">
              <BookingSection
                ride={rideData}
                role={rideData.type === "offer" ? "passenger" : "driver"}
                onBookRide={handleBookRide}
              />
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
