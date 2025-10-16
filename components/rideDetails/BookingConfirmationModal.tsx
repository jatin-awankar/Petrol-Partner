"use client";

import React from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";

interface BookingData {
  route?: {
    pickup?: string;
    dropoff?: string;
  };
  date?: string;
  time?: string;
  seats?: number;
  driverName?: string;
  paymentMethodLabel?: string;
  totalAmount?: number;
  specialRequests?: string;
}

interface BookingConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingData?: BookingData;
  onConfirm: () => void;
  isLoading?: boolean;
}

const SkeletonLine = ({
  width = "full",
  height = 4,
}: {
  width?: string;
  height?: number;
}) => (
  <div
    className={`bg-muted/30 animate-pulse rounded ${
      width === "full" ? "w-full" : width
    }`}
    style={{ height }}
  />
);

const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({
  isOpen,
  onClose,
  bookingData,
  onConfirm,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const showSkeleton = isLoading || !bookingData;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {showSkeleton ? (
              <SkeletonLine width="1/3" height={20} />
            ) : (
              "Confirm Booking"
            )}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isLoading}
          >
            <Icon name="X" size={20} />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Trip Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-medium text-foreground mb-3">
              {showSkeleton ? <SkeletonLine width="1/4" /> : "Trip Summary"}
            </h3>

            {showSkeleton ? (
              <>
                <SkeletonLine width="full" />
                <SkeletonLine width="full" />
                <SkeletonLine width="3/4" />
                <SkeletonLine width="2/3" />
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Route</span>
                  <span className="text-sm text-foreground">
                    {bookingData?.route?.pickup ?? "Pickup"} →{" "}
                    {bookingData?.route?.dropoff ?? "Dropoff"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Date & Time
                  </span>
                  <span className="text-sm text-foreground">
                    {bookingData?.date ?? "—"} at {bookingData?.time ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Seats</span>
                  <span className="text-sm text-foreground">
                    {bookingData?.seats ?? 1} seat
                    {bookingData?.seats && bookingData.seats > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Driver</span>
                  <span className="text-sm text-foreground">
                    {bookingData?.driverName ?? "—"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-medium text-foreground mb-3">
              {showSkeleton ? <SkeletonLine width="1/4" /> : "Payment Details"}
            </h3>

            {showSkeleton ? (
              <>
                <SkeletonLine width="full" />
                <SkeletonLine width="3/4" />
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Payment Method
                  </span>
                  <span className="text-sm text-foreground">
                    {bookingData?.paymentMethodLabel ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="text-sm font-medium text-primary">
                    ₹{bookingData?.totalAmount ?? 0}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Special Requests */}
          {showSkeleton ? (
            <SkeletonLine width="full" />
          ) : (
            bookingData?.specialRequests && (
              <div className="bg-muted/50 rounded-lg p-3">
                <h3 className="text-sm font-medium text-foreground mb-2">
                  Special Requests
                </h3>
                <p className="text-sm text-muted-foreground">
                  {bookingData.specialRequests}
                </p>
              </div>
            )
          )}

          {/* Cancellation Policy */}
          <div className="bg-warning/10 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <Icon name="Info" size={16} className="text-warning mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning mb-1">
                  Cancellation Policy
                </p>
                <p className="text-xs text-foreground">
                  Free cancellation up to 2 hours before departure. 50% refund
                  for cancellations within 2 hours. No refund for no-shows.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between space-x-3 p-4 border-t border-border">
          <Button
            variant="outline"
            size="default"
            onClick={onClose}
            disabled={isLoading}
            // className="w-full"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="default"
            onClick={onConfirm}
            disabled={isLoading}
            // className="w-full"
          >
            <Icon name="CreditCard" />
            {showSkeleton ? (
              <SkeletonLine width="1/3" height={16} />
            ) : (
              "Confirm & Pay"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmationModal;
