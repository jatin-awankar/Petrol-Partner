"use client";

import React from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import AppImage from "../AppImage";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";

interface RideInformationProps {
  ride?: any;
  role?: "driver" | "passenger";
}

const RideInformation: React.FC<RideInformationProps> = ({
  ride,
  role = "passenger",
}) => {
  const isLoading = !ride;
  const departureTime = formatTimeToAmPm(ride?.route?.pickupTime || "");
  const departureDate = formatUtcToTodayOrDayMonth(ride?.date || "");
  const seats =
    role === "passenger" ? ride?.availableSeats : ride?.seats_required;

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 md:p-5 shadow-soft space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base md:text-lg font-semibold text-foreground">
          {isLoading ? <Skeleton width={170} /> : "Fare and ride details"}
        </h3>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          {isLoading ? (
            <Skeleton width={60} />
          ) : ride?.type === "offer" ? (
            "Ride Offer"
          ) : (
            "Ride Request"
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Date", value: departureDate || "-", icon: "Calendar" },
          { label: "Time", value: departureTime || "-", icon: "Clock3" },
          { label: "Seats", value: `${seats ?? 0}`, icon: "Users" },
          {
            label: "Per seat",
            value: `₹${ride?.totalPrice ?? 0}`,
            icon: "Wallet",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/60 bg-secondary/70 p-2.5"
          >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Icon name={item.icon} size={12} />
              <span>{item.label}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {isLoading ? <Skeleton width={70} /> : item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/70 bg-card/80 p-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Base fare</span>
            <span className="text-foreground">
              {isLoading ? <Skeleton width={48} /> : `₹${ride?.baseFare ?? 0}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fuel share</span>
            <span className="text-foreground">
              {isLoading ? <Skeleton width={48} /> : `₹${ride?.fuelShare ?? 0}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Platform fee</span>
            <span className="text-foreground">
              {isLoading ? (
                <Skeleton width={48} />
              ) : (
                `₹${ride?.platformFee ?? 0}`
              )}
            </span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex items-center justify-between text-base font-semibold">
            <span className="text-foreground">Total per seat</span>
            <span className="text-primary">
              {isLoading ? (
                <Skeleton width={56} />
              ) : (
                `₹${ride?.totalPrice ?? 0}`
              )}
            </span>
          </div>
        </div>
      </div>

      {ride?.type === "offer" &&
        (ride?.vehicle?.make || ride?.vehicle?.model) && (
          <div className="rounded-xl border border-border/70 bg-card/80 p-3">
            <p className="text-sm font-semibold text-foreground mb-2">
              Vehicle details
            </p>
            <div className="flex items-center gap-3">
              {ride?.vehicle?.image && (
                <div className="w-16 h-12 rounded-lg overflow-hidden border border-border/70">
                  <AppImage
                    src={ride.vehicle.image}
                    alt={`${ride.vehicle.make ?? ""} ${ride.vehicle.model ?? ""}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {`${ride.vehicle.make ?? "-"} ${ride.vehicle.model ?? ""}`.trim()}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {ride.vehicle.color || "-"} • {ride.vehicle.year || "-"}
                </p>
                {ride.vehicle.plateNumber && (
                  <p className="text-xs text-muted-foreground">
                    {ride.vehicle.plateNumber}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

      <div className="rounded-xl border border-success/30 bg-success/10 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="Shield" size={14} className="text-success" />
          <p className="text-sm font-semibold text-success">Safety coverage</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {(ride?.safetyFeatures?.length
            ? ride.safetyFeatures
            : ["GPS Tracking", "Emergency support"]
          ).map((feature: string, idx: number) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 text-xs text-foreground"
            >
              <Icon name="Check" size={12} className="text-success" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RideInformation;
