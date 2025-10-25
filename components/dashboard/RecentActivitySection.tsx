"use client";

import React from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";
import { cn, formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";

const RecentActivitySection: React.FC = () => {
  const { bookingsData, loading } = useFetchBookings(4);

  const activities =
    bookingsData?.bookings?.map((booking: any) => {
      const isDriver = booking.user_role === "driver";
      const rideTitle = isDriver
        ? `Ride with ${booking.other_user_name}`
        : `Ride with ${booking.other_user_name}`;
      const rideSubtitle = `${booking.pickup_location} → ${booking.drop_location}`;
      const rideStatus = booking.status || "pending";

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
          color = "text-violet-400";
          bgColor = "bg-violet-400/10";
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
      };
    }) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-border rounded-xl p-6 mb-6 shadow-soft"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Activity
        </h2>
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
                <span className={cn("text-xs text-muted-foreground bg-muted px-2 py-1 rounded")}>
                        {activity.text}
                      </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {activity.subtitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">On: {activity.date}{" - "}{activity.time}</p>
                </div>

                <div className="flex items-center space-x-2">
                  {activity.status === "pending" && (
                    <div className="flex space-x-1">
                      <Button variant="outline" size="sm">
                        Decline
                      </Button>
                      <Button variant="default" size="sm">
                        Accept
                      </Button>
                    </div>
                  )}
                  {activity.status === "confirmed" && (
                    <Button variant="outline" size="sm">
                      <MessageCircle className="w-4 h-4 mr-1" />
                      Chat
                    </Button>
                  )}
                </div>
              </div>
            ))}
      </div>
    </motion.div>
  );
};

export default RecentActivitySection;
