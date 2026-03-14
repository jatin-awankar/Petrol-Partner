"use client";

import React from "react";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import Link from "next/link";
import { motion } from "framer-motion";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";
import { useCancelBooking } from "@/hooks/bookings/useCancelBooking";
import { cn, formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import { toast } from "sonner";

const RecentActivitySection: React.FC = () => {
  const { bookingsData, loading, refetch } = useFetchBookings(4);
  const { cancelBooking, loading: isUpdating } = useCancelBooking();

  const activities =
    bookingsData?.bookings?.map((booking: any) => {
      const isDriver = booking.user_role === "driver";
      const rideTitle = `Ride with ${booking.other_user_name}`;
      const rideSubtitle = `${booking.pickup_location} -> ${booking.drop_location}`;
      const rideStatus = booking.status || "pending";

      const isRideOfferFlow = Boolean(booking.ride_offer_id);
      const isRideRequestFlow = Boolean(booking.ride_request_id);
      const canRespondToPending =
        (isRideOfferFlow && isDriver) ||
        (isRideRequestFlow && booking.user_role === "passenger");

      let text = "pending";
      let icon = "Calendar";
      let color = "text-primary";
      let bgColor = "bg-primary/10";

      switch (rideStatus) {
        case "completed":
          text = "completed";
          icon = "CheckCircle";
          color = "text-success";
          bgColor = "bg-success/10";
          break;
        case "pending":
          text = "pending";
          icon = "Clock";
          color = "text-warning";
          bgColor = "bg-warning/10";
          break;
        case "cancelled":
          text = "cancelled";
          icon = "XCircle";
          color = "text-error";
          bgColor = "bg-error/10";
          break;
        case "confirmed":
          text = "confirmed";
          icon = "Bike";
          color = "text-primary";
          bgColor = "bg-primary/10";
          break;
      }

      return {
        id: booking.booking_id,
        title: rideTitle,
        subtitle: rideSubtitle,
        date: formatUtcToTodayOrDayMonth(booking.date),
        time: formatTimeToAmPm(booking.time),
        status: rideStatus,
        text,
        icon,
        color,
        bgColor,
        canRespondToPending,
      };
    }) ?? [];

  const handleUpdateStatus = async (
    bookingId: string,
    newStatus: "confirmed" | "cancelled",
  ) => {
    const response = await cancelBooking(bookingId, newStatus);
    if (!response) {
      throw new Error("Failed to update booking status");
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-soft"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
          <p className="text-xs text-muted-foreground">
            Latest requests, offers, and confirmations
          </p>
        </div>
        <Link href="/profile-settings">
          <Button variant="ghost" size="sm">
            View All
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex items-start space-x-3 animate-pulse">
                <Skeleton width={40} height={40} className="rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="50%" height={12} />
                  <Skeleton width="40%" height={12} />
                </div>
              </div>
            ))
          : activities.length === 0
          ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              No recent activity yet.
            </div>
          )
          : activities.map((activity: any) => (
              <div
                key={activity.id}
                className="flex items-start space-x-3 border-b border-border pb-3 last:border-0"
              >
                <div
                  className={`w-10 h-10 ${activity.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
                >
                  <Icon name={activity.icon} size={16} className={activity.color} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-medium text-foreground truncate">
                      {activity.title}
                    </h3>
                    <span
                      className={cn(
                        "text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full",
                      )}
                    >
                      {activity.text}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {activity.subtitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    On: {activity.date} - {activity.time}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  {activity.status === "pending" && activity.canRespondToPending && (
                    <div className="flex space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isUpdating}
                        onClick={async () => {
                          try {
                            await handleUpdateStatus(activity.id, "cancelled");
                            toast.success("Booking declined");
                            refetch();
                          } catch (error: any) {
                            toast.error(error?.message || "Failed to update booking status");
                          }
                        }}
                      >
                        Decline
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={isUpdating}
                        onClick={async () => {
                          try {
                            await handleUpdateStatus(activity.id, "confirmed");
                            toast.success("Booking accepted");
                            refetch();
                          } catch (error: any) {
                            toast.error(error?.message || "Failed to update booking status");
                          }
                        }}
                      >
                        Accept
                      </Button>
                    </div>
                  )}
                  {activity.status === "confirmed" && (
                    <Button variant="outline" size="sm">
                      <Icon name="MessageCircle" size={14} />
                      Chat
                    </Button>
                  )}
                </div>
              </div>
            ))}
      </div>
    </motion.section>
  );
};

export default RecentActivitySection;
