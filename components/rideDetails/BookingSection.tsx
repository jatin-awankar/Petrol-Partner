"use client";

import React, { useState } from "react";
import { CreditCard } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { SkeletonBlock } from "@/components/searchRides/SearchRidesSkeletons";

interface BookingSectionProps {
  ride?: any;
  role?: "driver" | "passenger";
  onBookRide: (bookingData: any) => void;
}

const BookingSection: React.FC<BookingSectionProps> = ({
  ride,
  role = "passenger",
  onBookRide,
}) => {
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [specialRequests, setSpecialRequests] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const isLoading = !ride;
  const normalizedSeatCapacity =
    Number(ride?.availableSeats ?? ride?.available_seats ?? ride?.seats_required ?? 1) || 1;

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-soft md:p-5">
        <SkeletonBlock className="h-6 w-44" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-11 w-full" />
      </div>
    );
  }

  const seatOptions = Array.from({ length: normalizedSeatCapacity }, (_, i) => ({
    value: (i + 1).toString(),
    label: `${i + 1} seat${i + 1 > 1 ? "s" : ""}`,
  }));
  const shouldShowSeatSelector = role === "passenger" || role === "driver";

  const paymentMethods =
    role === "passenger"
      ? [
          { value: "online", label: "Online settlement after ride" },
          { value: "upi", label: "Direct UPI settlement" },
          { value: "cash", label: "Cash settlement" },
        ]
      : [{ value: "cash", label: "Offline settlement confirmation" }];

  const totalCost = (ride?.totalPrice ?? 0) * selectedSeats;
  const platformFee = (ride?.platformFee ?? 0) * selectedSeats;
  const finalAmount = totalCost + platformFee;

  const handleBooking = async () => {
    if (role === "passenger" && !selectedPaymentMethod) return;

    setIsProcessing(true);

    const paymentMethodLabelMap: Record<string, string> = {
      online: "Online settlement",
      upi: "Direct UPI",
      cash: "Cash",
    };

    const bookingData = {
      rideId: ride?.id,
      role,
      seats: selectedSeats,
      specialRequests,
      paymentMethod: selectedPaymentMethod,
      paymentMethodLabel: paymentMethodLabelMap[selectedPaymentMethod] || "N/A",
      totalAmount: finalAmount,
      paymentStatus: "pending_owner_confirmation",
    };

    try {
      onBookRide(bookingData);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-soft md:p-5">
      <h3 className="mb-4 text-base font-semibold text-foreground md:text-lg">
        {role === "passenger" ? "Book this ride" : "Respond to ride request"}
      </h3>

      <div className="space-y-4">
        {shouldShowSeatSelector ? (
          <div className="space-y-1.5">
            <Label>Number of seats</Label>
            <Select
              value={selectedSeats.toString()}
              onValueChange={(value) =>
                setSelectedSeats(
                  Math.min(
                    Math.max(parseInt(value, 10), 1),
                    Math.max(normalizedSeatCapacity, 1),
                  ),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select seats" />
              </SelectTrigger>
              <SelectContent>
                {seatOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Special requests (optional)</Label>
          <Input
            type="text"
            placeholder="Optional instructions for the trip"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border/70 bg-card/80 p-3">
          <h4 className="mb-2 text-sm font-medium text-foreground">Estimated fare</h4>
          <div className="space-y-2 text-sm">
            {role === "passenger" ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {selectedSeats} seat{selectedSeats > 1 ? "s" : ""} × {"\u20B9"}
                    {ride?.totalPrice ?? 0}
                  </span>
                  <span className="text-foreground">
                    {"\u20B9"}
                    {totalCost}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span className="text-foreground">
                    {"\u20B9"}
                    {platformFee}
                  </span>
                </div>
                <div className="h-px bg-border" />
              </>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Estimated total</span>
              <span className="font-semibold text-primary">
                {"\u20B9"}
                {finalAmount}
              </span>
            </div>
          </div>
        </div>

        {role === "passenger" ? (
          <div className="space-y-1.5">
            <Label>Preferred settlement method</Label>
            <Select value={selectedPaymentMethod} onValueChange={(value) => setSelectedPaymentMethod(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select settlement method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <Icon name="Shield" size={15} className="mt-0.5 text-warning" />
            <p className="text-xs text-foreground">
              Share your trip details with trusted contacts. Settlement happens only after ride completion.
            </p>
          </div>
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={handleBooking}
          disabled={(role === "passenger" && !selectedPaymentMethod) || isProcessing}
          className="w-full"
        >
          <CreditCard />
          {isProcessing
            ? "Processing..."
            : role === "passenger"
              ? `Send booking request for \u20B9${finalAmount}`
              : "Respond to request"}
        </Button>
      </div>
    </section>
  );
};

export default BookingSection;
