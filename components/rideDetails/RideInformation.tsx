"use client";

import React from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import AppImage from "../AppImage";

interface RideInformationProps {
  ride?: any;
  role?: "driver" | "passenger";
}

const RideInformation: React.FC<RideInformationProps> = ({
  ride,
  role = "passenger",
}) => {
  const isLoading = !ride;

  return (
    <div className="bg-card rounded-lg p-4 border border-border shadow-soft">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {isLoading ? <Skeleton width={200} /> : "Ride Information"}
      </h3>
      <div className="space-y-4">
        {/* Date & Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Calendar" size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isLoading ? <Skeleton width={100} /> : ride?.date ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? (
                  <Skeleton width={80} />
                ) : (
                  `Departure: ${ride?.route?.pickupTime ?? "—"}`
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">
              {isLoading ? (
                <Skeleton width={50} />
              ) : (
                `${ride?.availableSeats ?? "—"} seats left`
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? (
                <Skeleton width={60} />
              ) : (
                `of ${ride?.totalSeats ?? "—"} total`
              )}
            </p>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="space-y-2">
            {["Base fare", "Fuel share", "Platform fee"].map((label) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{label}</span>
                <span className="text-sm text-foreground">
                  {isLoading ? (
                    <Skeleton width={40} />
                  ) : label === "Base fare" ? (
                    `₹${ride?.baseFare ?? "—"}`
                  ) : label === "Fuel share" ? (
                    `₹${ride?.fuelShare ?? "—"}`
                  ) : (
                    `₹${ride?.platformFee ?? "—"}`
                  )}
                </span>
              </div>
            ))}
            <hr className="border-border my-2" />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-foreground">
                Total per seat
              </span>
              <span className="text-base font-semibold text-primary">
                {isLoading ? (
                  <Skeleton width={50} />
                ) : (
                  `₹${ride?.totalPrice ?? "—"}`
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Vehicle Details */}
        {ride?.type === "offer" && (
          <div className="flex items-center space-x-3">
            <div className="w-16 h-12 rounded-lg overflow-hidden">
              {isLoading ? (
                <Skeleton height="100%" width="100%" />
              ) : (
                <AppImage
                  src={ride?.vehicle?.image ?? ""}
                  alt={`${ride?.vehicle?.make ?? ""} ${
                    ride?.vehicle?.model ?? ""
                  }`}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {isLoading ? (
                  <Skeleton width={80} />
                ) : (
                  `${ride?.vehicle?.make ?? "—"} ${ride?.vehicle?.model ?? ""}`
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? (
                  <Skeleton width={100} />
                ) : (
                  `${ride?.vehicle?.color ?? "—"} • ${
                    ride?.vehicle?.year ?? "—"
                  }`
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? (
                  <Skeleton width={80} />
                ) : (
                  ride?.vehicle?.plateNumber ?? "—"
                )}
              </p>
            </div>
            {ride?.vehicle?.fuelEfficiency && (
              <div className="flex items-center space-x-1">
                {isLoading ? (
                  <Skeleton width={30} />
                ) : (
                  <>
                    <Icon name="Fuel" size={14} className="text-success" />
                    <span className="text-xs text-success font-medium">
                      {ride.vehicle.fuelEfficiency} km/l
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Safety Features */}
        <div className="bg-success/10 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <Icon name="Shield" size={16} className="text-success" />
            <span className="text-sm font-medium text-success">
              Safety Features
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isLoading
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} height={15} />
                ))
              : ride?.safetyFeatures?.map((feature: string, index: number) => (
                  <div key={index} className="flex items-center space-x-1">
                    <Icon name="Check" size={12} className="text-success" />
                    <span className="text-xs text-foreground">{feature}</span>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RideInformation;
