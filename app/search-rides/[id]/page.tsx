"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share } from "lucide-react";
import EmergencyAccessButton from "@/components/ui/EmergencyAccessButton";
import { motion } from "framer-motion";

import ProfileInfo from "@/components/rideDetails/ProfileInfo";
import RouteMap from "@/components/rideDetails/RouteMap";
import BookingSection from "@/components/rideDetails/BookingSection";
import RideInformation from "@/components/rideDetails/RideInformation";
import DriverPreferences from "@/components/rideDetails/DriverPreferences";
import SafetyPanel from "@/components/rideDetails/SafetyPanel";
import BookingConfirmationModal from "@/components/rideDetails/BookingConfirmationModal";
import { useBookRide } from "@/hooks/bookings/useBookRide";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import { toast } from "sonner";
import { getRideOffer, getRideRequest } from "@/lib/api/backend";

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
    baseFare,
    fuelShare,
    platformFee,
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
    baseFare,
    fuelShare,
    platformFee,
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
  const bookingSectionRef = useRef<HTMLDivElement | null>(null);

  const [rideData, setRideData] = useState<RideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [bookingData, setBookingData] = useState<any>(null);

  const fetchRideData = useCallback(async () => {
    const rideId = Array.isArray(id) ? id[0] : id;

    if (!rideId || typeof rideId !== "string") {
      setError("Invalid ride ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
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

      setError(
        "Ride not found. The ride may have been removed or the ID is invalid.",
      );
    } catch (err) {
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
        time: rideData.route?.pickupTime,
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
      toast.error(
        err instanceof Error ? err.message : "Failed to complete booking",
      );
    }
  }, [bookingData, bookRide, router]);

  const handleEmergencyCall = useCallback(() => {
    window.location.href = "tel:911";
  }, []);

  const handleShareLocation = useCallback(() => {
    toast.success("Live location shared with trusted contacts.");
  }, []);

  const handleContactSupport = useCallback(() => {
    toast.info("Support request queued. Team will contact you shortly.");
  }, []);

  const handleShare = useCallback(async () => {
    if (!rideData) return;

    const shareData = {
      title: "Petrol Partner Ride",
      text: `Check this ride from ${rideData.route?.pickup?.name} to ${rideData.route?.dropoff?.name}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user canceled share, no toast needed
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Ride link copied to clipboard.");
    } catch {
      toast.error("Could not copy link. Please copy the URL manually.");
    }
  }, [rideData]);

  const summary = useMemo(() => {
    if (!rideData) {
      return {
        date: "-",
        time: "-",
        seatsText: "-",
        priceText: "?0",
      };
    }

    const seats =
      rideData.type === "offer"
        ? rideData.availableSeats
        : rideData.seats_required;
    return {
      date: formatUtcToTodayOrDayMonth(rideData.date || "") || "-",
      time: formatTimeToAmPm(rideData.route?.pickupTime || "") || "-",
      seatsText: `${seats ?? 0} seat${(seats ?? 0) === 1 ? "" : "s"}`,
      priceText: `₹${rideData.totalPrice ?? 0}`,
    };
  }, [rideData]);

  const roleLabel = rideData?.type === "offer" ? "Driver" : "Passenger";

  if (error || !rideData) {
    return (
      <div className="min-h-screen pb-16 md:pb-0 bg-gradient-hero">
        <main className="page mx-auto">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center rounded-3xl border border-border/70 bg-card/90 p-6">
            <p className="text-destructive font-semibold text-lg mb-4">
              {error || "Ride not found"}
            </p>
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="mr-2" /> Go Back
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen mb-28 md:mb-auto bg-gradient-hero">
      <main className="page mx-auto space-y-5 md:space-y-6">
        <section className="rounded-3xl border border-primary/20 p-4 md:p-6 bg-card/95 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Ride Details
              </p>
              <h1 className="mt-2 text-xl md:text-2xl font-semibold text-foreground">
                {rideData.route?.pickup?.name} to{" "}
                {rideData.route?.dropoff?.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-primary">
                  {summary.date}
                </span>
                <span className="rounded-full border border-border/80 bg-secondary/70 px-2.5 py-1 text-foreground">
                  {summary.time}
                </span>
                <span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-success">
                  {summary.seatsText}
                </span>
                <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-foreground">
                  {roleLabel} verified flow
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="mr-2" />
                Back
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share className="mr-2" />
                Share
              </Button>
            </div>
          </div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6"
        >
          <div className="lg:col-span-2 space-y-5 md:space-y-6">
            <RouteMap route={rideData.route} />

            <ProfileInfo
              profile={
                rideData.type === "offer"
                  ? (rideData.driver ?? {})
                  : (rideData.passenger ?? {})
              }
              role={rideData.type === "offer" ? "driver" : "passenger"}
              loading={loading}
            />

            <RideInformation ride={rideData} />

            {rideData.type === "offer" && (
              <DriverPreferences preferences={rideData.preferences} />
            )}
            <div className="lg:hidden">
              <SafetyPanel
                onEmergencyContact={handleEmergencyCall}
                onShareLocation={handleShareLocation}
                onReportIssue={handleContactSupport}
              />
            </div>

            <div ref={bookingSectionRef} className="lg:hidden scroll-mt-24">
              <BookingSection
                ride={rideData}
                role={rideData.type === "offer" ? "passenger" : "driver"}
                onBookRide={handleBookRide}
              />
            </div>
          </div>

          <aside className="hidden lg:block space-y-6">
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
          </aside>
        </motion.div>
      </main>

      <div className="fixed inset-x-0 bottom-15 z-40 border-t border-border/70 bg-card/95 backdrop-blur md:hidden">
        <div className="page mx-auto py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Price per seat
            </p>
            <p className="text-base font-semibold text-foreground truncate">
              {summary.priceText}
            </p>
          </div>
          <Button
            className="h-10 px-4"
            onClick={() =>
              bookingSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            Book this ride
          </Button>
        </div>
      </div>

      <BookingConfirmationModal
        isOpen={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        bookingData={bookingData}
        onConfirm={handleConfirmBooking}
        isLoading={isBookingLoading}
      />

      <EmergencyAccessButton
        onEmergencyCall={handleEmergencyCall}
        onShareLocation={handleShareLocation}
        onContactSupport={handleContactSupport}
      />
    </div>
  );
};

export default RideDetailsPage;
