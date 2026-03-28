"use client";

import React from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface SeatsSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
  mode?: "offer" | "request";
}

const seatOptions = [1, 2, 3, 4, 5, 6];

const SeatsSection: React.FC<SeatsSectionProps> = ({
  formData,
  updateFormData,
  errors,
  mode = "offer",
}) => {
  const seatValue = mode === "offer" ? formData.availableSeats : formData.seatsRequired;

  const setSeatValue = (seats: number) => {
    if (mode === "offer") {
      updateFormData({ ...formData, availableSeats: seats });
      return;
    }
    updateFormData({ ...formData, seatsRequired: seats });
  };

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4 md:p-5 space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
          <Icon name="Users" size={18} className="text-primary" />
          {mode === "offer" ? "Available seats" : "Seats needed"}
        </h3>
        <Badge variant="outline">{seatValue} seat{seatValue > 1 ? "s" : ""}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {mode === "offer"
          ? "Choose how many passengers you can take in this ride."
          : "Choose how many seats you want to book."}
      </p>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {seatOptions.map((seats) => (
          <Button
            key={seats}
            variant={seatValue === seats ? "default" : "outline"}
            className="h-12 sm:h-14"
            onClick={() => setSeatValue(seats)}
          >
            <span className="text-base font-semibold">{seats}</span>
          </Button>
        ))}
      </div>

      {(errors.availableSeats || errors.seatsRequired) && (
        <p className="text-xs text-destructive">{errors.availableSeats || errors.seatsRequired}</p>
      )}

      <div className="rounded-lg bg-background/70 border border-border/70 p-3 text-xs text-muted-foreground">
        {mode === "offer"
          ? "Tip: Keep one seat free if you expect luggage on long routes."
          : "Tip: Request only the seats you need to improve matching speed."}
      </div>
    </div>
  );
};

export default SeatsSection;
