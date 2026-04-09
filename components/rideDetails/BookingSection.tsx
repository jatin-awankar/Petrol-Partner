"use client";

import React, { useState } from "react";
import Skeleton from "react-loading-skeleton";
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

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 md:p-5 shadow-soft space-y-3">
        <Skeleton width={170} height={22} />
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={88} />
        <Skeleton height={42} />
      </div>
    );
  }

  const seatOptions = Array.from(
    { length: ride?.availableSeats || 1 },
    (_, i) => ({
      value: (i + 1).toString(),
      label: `${i + 1} seat${i + 1 > 1 ? "s" : ""}`,
    }),
  );

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
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 md:p-5 shadow-soft">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-4">
        {role === "passenger" ? "Book this ride" : "Respond to ride request"}
      </h3>

      <div className="space-y-4">
        {role === "passenger" && (
          <div className="space-y-1.5">
            <Label>Number of seats</Label>
            <Select
              value={selectedSeats.toString()}
              onValueChange={(value) => setSelectedSeats(parseInt(value, 10))}
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
        )}

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
          <h4 className="text-sm font-medium text-foreground mb-2">
            Estimated fare
          </h4>
          <div className="space-y-2 text-sm">
            {role === "passenger" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {selectedSeats} seat{selectedSeats > 1 ? "s" : ""} × ₹
                    {ride?.totalPrice ?? 0}
                  </span>
                  <span className="text-foreground">₹{totalCost}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span className="text-foreground">₹{platformFee}</span>
                </div>
                <div className="h-px bg-border" />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">
                Estimated total
              </span>
              <span className="font-semibold text-primary">₹{finalAmount}</span>
            </div>
          </div>
        </div>

        {role === "passenger" && (
          <div className="space-y-1.5">
            <Label>Preferred settlement method</Label>
            <Select
              value={selectedPaymentMethod}
              onValueChange={(value) => setSelectedPaymentMethod(value)}
            >
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
        )}

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <Icon name="Shield" size={15} className="text-warning mt-0.5" />
            <p className="text-xs text-foreground">
              Share your trip details with trusted contacts. Settlement happens
              only after ride completion.
            </p>
          </div>
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={handleBooking}
          disabled={
            (role === "passenger" && !selectedPaymentMethod) || isProcessing
          }
          className="w-full"
        >
          <CreditCard />
          {isProcessing
            ? "Processing..."
            : role === "passenger"
              ? `Send booking request for ₹${finalAmount}`
              : "Respond to request"}
        </Button>
      </div>
    </section>
  );
};

export default BookingSection;
