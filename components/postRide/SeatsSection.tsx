"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { Button } from "../ui/button";

class SeatsSectionErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("SeatsSection Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl">
          Something went wrong loading the seats section.
        </div>
      );
    }
    return this.props.children;
  }
}

interface SeatsSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
}

const SeatsSection: React.FC<SeatsSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);

  const handleSeatsChange = (seats: number) => {
    updateFormData({ ...formData, availableSeats: seats });
  };

  const seatOptions = [1, 2, 3, 4, 5, 6];

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse shadow-card">
        <Skeleton height={26} width="50%" className="mb-2" />
        <Skeleton height={40} width="100%" count={3} />
        <Skeleton height={120} width="100%" className="rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-card">
      <h3 className="text-lg font-semibold text-foreground flex items-center mb-4">
        <Icon name="Users" size={20} className="mr-2 text-primary" />
        Available Seats
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">
            How many passengers can you accommodate?
          </label>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {seatOptions.map((seats) => (
              <Button
                key={seats}
                variant={
                  formData.availableSeats === seats ? "default" : "outline"
                }
                onClick={() => handleSeatsChange(seats)}
                className="h-16 flex flex-col items-center justify-center"
              >
                <Icon name="User" size={20} />
                <span className="text-sm font-medium mt-1">{seats}</span>
              </Button>
            ))}
          </div>
          {errors?.availableSeats && (
            <p className="text-sm text-error mt-2">{errors.availableSeats}</p>
          )}
        </div>

        <div className="bg-muted/40 rounded-lg p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">
            Seat Layout Preview
          </h4>
          <div className="flex items-center justify-center">
            <div className="bg-card border border-border rounded-lg p-4 max-w-xs">
              <div className="flex justify-between items-center mb-3">
                <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                  <Icon name="User" size={16} color="white" />
                </div>
                <div className="text-xs text-muted-foreground">Driver</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {Array.from(
                  { length: Math.min(formData.availableSeats, 4) },
                  (_, index) => (
                    <div
                      key={index}
                      className="w-8 h-8 bg-success/20 border border-success rounded flex items-center justify-center"
                    >
                      <Icon name="User" size={14} className="text-success" />
                    </div>
                  )
                )}
                {Array.from(
                  { length: Math.max(0, 4 - formData.availableSeats) },
                  (_, index) => (
                    <div
                      key={`empty-${index}`}
                      className="w-8 h-8 bg-muted border border-border rounded flex items-center justify-center"
                    >
                      <Icon
                        name="X"
                        size={12}
                        className="text-muted-foreground"
                      />
                    </div>
                  )
                )}
              </div>

              {formData.availableSeats > 4 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Array.from(
                    { length: formData.availableSeats - 4 },
                    (_, index) => (
                      <div
                        key={`extra-${index}`}
                        className="w-8 h-8 bg-success/20 border border-success rounded flex items-center justify-center"
                      >
                        <Icon name="User" size={14} className="text-success" />
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Green seats are available for passengers.
          </p>
        </div>

        <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <Icon name="Info" size={16} className="text-accent mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Seat Tips</p>
              <ul className="text-muted-foreground mt-1 space-y-1">
                <li>- Consider comfort for longer rides</li>
                <li>- More seats can lower cost per person</li>
                <li>- Leave room for bags if needed</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function SeatsSectionWithErrorBoundary(
  props: SeatsSectionProps
) {
  return (
    <SeatsSectionErrorBoundary>
      <SeatsSection {...props} />
    </SeatsSectionErrorBoundary>
  );
}
