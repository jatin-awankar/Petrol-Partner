"use client";

import { motion } from "framer-motion";
import React, { useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Clock, MapPin, MessageCircle, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { useRideBookings } from "@/hooks/dashboard-rides/useRideBookings";
import { BookRequestDialog } from "./dialog/BookRequestDialog";

const RideRequestCard = ({ request }: { request: RideRequest }) => {
  const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
  const [selectedRideRequest, setSelectedRideRequest] =
    useState<RideRequest | null>(null);
  const { fetchBookedRides } = useRideBookings();

  const openBookDialog = (request: RideRequest) => {
    setSelectedRideRequest(request);
    setIsBookDialogOpen(true);
  };

  const closeBookDialog = () => {
    setIsBookDialogOpen(false);
    setSelectedRideRequest(null);
  };

  const handleBookRideRequest = async (
    rideRequestId: string,
    seats: number
  ) => {
    try {
      // Call your API or Supabase function to create the booking
      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_request_id: rideRequestId,
          seats_booked: seats,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(result.error);
        throw new Error(result.error || "Unknown error");
      }

      toast.success("Ride request booked successfully!");
      setIsBookDialogOpen(false);
      await fetchBookedRides(); // Refresh bookings list
      closeBookDialog();
    } catch (err: any) {
      toast.error("Failed to book ride request", { description: err.message });
    }
  };

  return (
    <motion.div
      key={request.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-soft transition-all duration-300">
        <CardContent className="p-4">
          <div
            className="flex items-start justify-between mb-3 cursor-pointer"
            onClick={() => redirect(`/profile/${request.passenger?.id}`)}
          >
            <div className="flex items-center space-x-3">
              <Avatar className="bg-gradient-primary card-profile">
                <AvatarImage src={request.passenger?.avatar_url} />
                <AvatarFallback className="bg-gradient-primary text-white text-2xl">
                  {request.passenger?.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold">
                  {request.passenger?.full_name || "Unknown Passenger"}
                </h3>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>★ {request.passenger?.avg_rating || 0}</span>
                  <span>•</span>
                  <span>{request.passenger?.college || "College"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end space-y-1">
              <Badge variant="secondary">Requesting</Badge>
              <span className="text-lg font-bold text-secondary">
                ≤₹{request.price_per_seat}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{request.from_location}</span>
              <span className="text-muted-foreground">→</span>
              <span>{request.to_location}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>
                  {format(
                    new Date(request.preferred_departure_time),
                    "MMM d, h:mm a"
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>
                  {request.requested_seats} passenger
                  {request.requested_seats > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {request.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {request.description}
              </p>
            )}

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => openBookDialog(request)}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Respond to Request
              </Button>
            </div>
            {selectedRideRequest && (
              <BookRequestDialog
                open={isBookDialogOpen}
                onOpenChange={setIsBookDialogOpen}
                request={selectedRideRequest}
                onSuccess={() => handleBookRideRequest}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default RideRequestCard;
