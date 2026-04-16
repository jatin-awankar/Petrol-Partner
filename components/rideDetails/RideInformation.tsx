"use client";

import React from "react";
import Icon from "../AppIcon";
import AppImage from "../AppImage";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import { SkeletonBlock } from "@/components/searchRides/SearchRidesSkeletons";

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
  const seats = role === "passenger" ? ride?.availableSeats : ride?.seats_required;

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-soft md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground md:text-lg">
          {isLoading ? <SkeletonBlock className="h-5 w-44" /> : "Fare and ride details"}
        </h3>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          {isLoading ? (
            <SkeletonBlock className="h-4 w-20" />
          ) : ride?.type === "offer" ? (
            "Ride Offer"
          ) : (
            "Ride Request"
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Date", value: departureDate || "-", icon: "Calendar" },
          { label: "Time", value: departureTime || "-", icon: "Clock3" },
          { label: "Seats", value: `${seats ?? 0}`, icon: "Users" },
          {
            label: "Per seat",
            value: `\u20B9${ride?.totalPrice ?? 0}`,
            icon: "Wallet",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border/60 bg-secondary/70 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Icon name={item.icon} size={12} />
              <span>{item.label}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {isLoading ? <SkeletonBlock className="h-4 w-16" /> : item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/70 bg-card/80 p-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Base fare</span>
            <span className="text-foreground">
              {isLoading ? <SkeletonBlock className="h-4 w-12" /> : `\u20B9${ride?.baseFare ?? 0}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fuel share</span>
            <span className="text-foreground">
              {isLoading ? <SkeletonBlock className="h-4 w-12" /> : `\u20B9${ride?.fuelShare ?? 0}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Platform fee</span>
            <span className="text-foreground">
              {isLoading ? <SkeletonBlock className="h-4 w-12" /> : `\u20B9${ride?.platformFee ?? 0}`}
            </span>
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="flex items-center justify-between text-base font-semibold">
            <span className="text-foreground">Total per seat</span>
            <span className="text-primary">
              {isLoading ? <SkeletonBlock className="h-5 w-14" /> : `\u20B9${ride?.totalPrice ?? 0}`}
            </span>
          </div>
        </div>
      </div>

      {ride?.type === "offer" && (ride?.vehicle?.make || ride?.vehicle?.model) ? (
        <div className="rounded-xl border border-border/70 bg-card/80 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">Vehicle details</p>
          <div className="flex items-center gap-3">
            {ride?.vehicle?.image ? (
              <div className="h-12 w-16 overflow-hidden rounded-lg border border-border/70">
                <AppImage
                  src={ride.vehicle.image}
                  alt={`${ride.vehicle.make ?? ""} ${ride.vehicle.model ?? ""}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {`${ride.vehicle.make ?? "-"} ${ride.vehicle.model ?? ""}`.trim()}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {ride.vehicle.color || "-"} • {ride.vehicle.year || "-"}
              </p>
              {ride.vehicle.plateNumber ? (
                <p className="text-xs text-muted-foreground">{ride.vehicle.plateNumber}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-success/30 bg-success/10 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="Shield" size={14} className="text-success" />
          <p className="text-sm font-semibold text-success">Safety coverage</p>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {(ride?.safetyFeatures?.length
            ? ride.safetyFeatures
            : ["GPS Tracking", "Emergency support"]
          ).map((feature: string, idx: number) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs text-foreground">
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
