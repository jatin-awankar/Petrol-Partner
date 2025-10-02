import { motion } from "framer-motion";
import React from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import {
  CheckCircle,
  Clock,
  MapPin,
  MessageCircle,
  Navigation,
  Star,
} from "lucide-react";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";

const RideBookedCard = ({
  booking,
  currentUserId,
  onMessage,
  onTrack,
  onRate,
  onDetails,
}: {
  booking: RideBooking;
  currentUserId: string | undefined;
  onMessage: () => void;
  onTrack: () => void;
  onRate: () => void;
  onDetails: () => void;
}) => {
  // 🔹 Helper to normalize booking data
  const getBookingDetails = (booking: RideBooking, currentUserId: string) => {
    const ride = booking?.ride || null;
    const rideRequest = booking?.ride_request || null;

    let role = "";
    let person = null;

    // Check if current user is driver or passenger
    const isCurrentUserDriver = booking.driver_id === currentUserId;
    const isCurrentUserPassenger = booking.passenger_id === currentUserId;

    if (ride) {
      role = isCurrentUserPassenger ? "Driver" : "Passenger";
      person = isCurrentUserPassenger ? ride.driver : booking.passenger;
    } else if (rideRequest) {
      role = isCurrentUserDriver ? "Passenger" : "Driver";
      person = isCurrentUserDriver ? rideRequest.passenger : booking.driver;
    }

    return {
      role,
      person,
      avgRating: person?.avg_rating ?? 0.0,
      from: ride?.from_location || rideRequest?.from_location,
      to: ride?.to_location || rideRequest?.to_location,
      departureTime:
        ride?.departure_time || rideRequest?.preferred_departure_time,
      status: ride?.status || rideRequest?.status,
      seats_booked: booking?.seats_booked || 0,
      total_price: booking?.total_price || 0,
      description: ride?.description || rideRequest?.description,
    };
  };

  const {
    role,
    person,
    avgRating,
    from,
    to,
    departureTime,
    status,
    description,
  } = getBookingDetails(booking, currentUserId || "");

  return (
    <motion.div
      key={booking.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-soft transition-all duration-300">
        <CardContent className="p-4">
          {/* Person info (Driver or Passenger) */}
          <div className="flex items-start justify-between mb-3 cursor-pointer" onClick={() => redirect(`/profile/${person?.id}`)}>
            <div className="flex items-center space-x-3">
              <Avatar className="bg-gradient-primary card-profile">
                <AvatarImage
                  src={person?.avatar_url}
                />
                <AvatarFallback className="bg-gradient-primary text-white text-2xl">
                  {person?.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold">
                  {person?.full_name || "Unknown"}
                </h3>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>★ {avgRating.toFixed(1)}</span>
                  <span>•</span>
                  <span>{person?.college || "College"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end space-y-1">
              <Badge
                variant="outline"
                className="border-green-500 text-green-700 bg-green-50"
              >
                {role}
              </Badge>
              <span className="text-lg font-bold text-green-600">
                ₹{booking.total_price}
              </span>
              <span className="text-xs text-muted-foreground">
                {booking.seats_booked} seat{booking.seats_booked > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Route info */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{from}</span>
              <span className="text-muted-foreground">→</span>
              <span>{to}</span>
            </div>

            {/* Departure time and status */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>
                  {departureTime
                    ? format(new Date(departureTime), "MMM d, h:mm a")
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-600 font-medium">{status}</span>
              </div>
            </div>

            {/* Description */}
            {description && (
              <p className="text-sm text-muted-foreground mt-2">
                {description}
              </p>
            )}

            {/* Action buttons */}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[100px]"
                onClick={onMessage}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Message
              </Button>
              <Button
                variant="default"
                size="sm"
                className="min-w-[100px]"
                onClick={onTrack}
              >
                <Navigation className="w-4 h-4 mr-2" />
                Track Live
              </Button>
              {status === "completed" && (
                <Button
                  variant="default"
                  size="sm"
                  className="min-w-[100px]"
                  onClick={onRate}
                >
                  <Star className="w-4 h-4 mr-2" />
                  Rate
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="min-w-[100px]"
                onClick={onDetails}
              >
                Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default RideBookedCard;
