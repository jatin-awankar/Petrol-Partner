"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle, Clock } from "lucide-react";
import { useRideBookings } from "@/hooks/dashboard-rides/useRideBookings";
import { useProfile } from "@/hooks/useProfile";

interface Activity {
  id: string | number;
  type: "upcoming" | "request" | "completed";
  title: string;
  subtitle: string;
  time: string;
  status: "active" | "confirmed" | "completed";
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const STATUS_MAP = {
  active: {
    icon: <Clock size={16} className="text-yellow-600" />,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  confirmed: {
    icon: <Calendar size={16} className="text-blue-600" />,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  completed: {
    icon: <CheckCircle size={16} className="text-green-600" />,
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
};

const RecentActivitySection = () => {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const { bookedRides, loading: bookedRidesLoading } = useRideBookings();
  const { profile } = useProfile();

  useEffect(() => {
    if (!profile || bookedRidesLoading) return;

    const mappedActivities: Activity[] = bookedRides
      .filter(
        (b) =>
          b.passenger_id === profile.id || // user booked as passenger
          b.ride?.driver?.id === profile.id // user is the driver
      )
      .slice(0, 5)
      .map((b) => {
        const status = b.status as "active" | "confirmed" | "completed";
        const mapping = STATUS_MAP[status];

        const partnerName =
          b.ride_request?.passenger?.full_name ||
          b.ride?.driver?.full_name ||
          "No partner info";

        return {
          id: b.id,
          type:
            status === "active"
              ? "request"
              : status === "confirmed"
              ? "upcoming"
              : "completed",
          title:
            status === "completed"
              ? `Completed ride: ${b.ride?.from_location} → ${b.ride?.to_location}`
              : `Ride: ${b.ride?.from_location} → ${b.ride?.to_location}`,
          subtitle: `with ${partnerName}`,
          time: new Date(b.created_at).toLocaleString(),
          status,
          icon: mapping.icon,
          color: mapping.color,
          bgColor: mapping.bgColor,
        };
      });

    setActivities(mappedActivities);
  }, [bookedRides, profile, bookedRidesLoading]);

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Activity
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/activity")}
        >
          View All
        </Button>
      </div>

      {bookedRidesLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent activity</p>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start space-x-3 border-b border-border/40 pb-3 last:border-none"
            >
              <div
                className={`w-10 h-10 ${activity.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
              >
                {activity.icon}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {activity.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activity.subtitle}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {activity.time}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {activity.status === "active" && (
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
                    Chat
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentActivitySection;
