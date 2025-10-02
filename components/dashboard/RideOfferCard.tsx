"use client";

import { motion } from "framer-motion";
import React, { useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Clock, MapPin, Users } from "lucide-react";
import { Badge } from "../ui/badge";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { toast } from "sonner";
import { useRideBookings } from "@/hooks/dashboard-rides/useRideBookings";
import { BookOfferDialog } from "./dialog/BookOfferDialog";

const RideOfferCard = ({ ride }: { ride: Ride }) => {

  const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const { fetchBookedRides } = useRideBookings();

  const openBookDialog = (ride: Ride) => {
    setSelectedRide(ride);
    setIsBookDialogOpen(true);
  };

  const closeBookDialog = () => {
    setIsBookDialogOpen(false);
    setSelectedRide(null);
  };

  const handleBookRide = async (rideId: string, seats: number) => {
    try {
      const res = await fetch("/api/rides/book-ride-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId, seats }),
      });

      const result = await res.json();

      if (!res.ok) {
        console.error(result.error);
        throw new Error(result.error || "Failed to book")
      };

      toast.success("Ride booked successfully!");
      await fetchBookedRides(); // Refresh bookings list
      closeBookDialog();
    } catch (err) {
      toast.error(`Error booking ride: ${err}`);
    }
  };

  return (
  <motion.div
    key={ride.id}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <Card className="hover:shadow-soft transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3 cursor-pointer"  onClick={() => redirect(`/profile/${ride.driver?.id}`)}>
          <div className="flex items-center space-x-3">
            <Avatar className="bg-gradient-primary card-profile">
              <AvatarImage src={ride.driver?.avatar_url} />
              <AvatarFallback className="bg-gradient-primary text-white text-2xl">
                {ride.driver?.full_name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar> 
            <div>
              <h3 className="font-semibold">
                {ride.driver?.full_name || "Unknown Driver"}
              </h3>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <span>★ {ride.driver?.avg_rating}</span>
                <span>•</span>
                <span>{ride.driver?.college || "College"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-1">
            <Badge variant="default">Offering</Badge>
            <span className="text-lg font-bold text-primary">
              ₹{ride.price_per_seat}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{ride.from_location}</span>
            <span className="text-muted-foreground">→</span>
            <span>{ride.to_location}</span>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>
                {format(new Date(ride.departure_time), "MMM d, h:mm a")}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>
                {ride.available_seats} seat
                {ride.available_seats > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {ride.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {ride.description}
            </p>
          )}

          <div className="pt-2">
            <Button className="w-full" onClick={() => openBookDialog(ride)}>
              Book Ride
            </Button>
          </div>
          {selectedRide && (
            <BookOfferDialog
              open={isBookDialogOpen}
              onOpenChange={setIsBookDialogOpen}
              ride={selectedRide}
              onBook={handleBookRide}
            />
          )}
        </div>
      </CardContent>
    </Card>
  </motion.div>
)};

export default RideOfferCard;
