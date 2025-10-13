"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
interface Activity {
  id: number | string;
  type: string;
  title: string;
  subtitle: string;
  time: string;
  status: string;
  icon: string;
  color: string;
  bgColor: string;
}

const RecentActivitySection: React.FC = () => {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulate fetching activities (replace with API call)
  useEffect(() => {
    const timer = setTimeout(() => {
      setActivities([
        {
          id: 1,
          type: "upcoming",
          title: "Ride to Central Library",
          subtitle: "with Sarah Chen",
          time: "Today, 2:30 PM",
          status: "confirmed",
          icon: "Calendar",
          color: "text-primary",
          bgColor: "bg-primary/10",
        },
        {
          id: 2,
          type: "request",
          title: "Ride Request from Alex",
          subtitle: "Campus to Downtown Mall",
          time: "1 hour ago",
          status: "pending",
          icon: "Clock",
          color: "text-warning",
          bgColor: "bg-warning/10",
        },
        {
          id: 3,
          type: "completed",
          title: "Completed ride to Airport",
          subtitle: "with Mike Johnson",
          time: "Yesterday, 6:00 PM",
          status: "completed",
          icon: "CheckCircle",
          color: "text-success",
          bgColor: "bg-success/10",
        },
        {
          id: 4,
          type: "booking",
          title: "New booking received",
          subtitle: "Campus to Train Station",
          time: "2 days ago",
          status: "completed",
          icon: "Bike",
          color: "text-violet-400",
          bgColor: "bg-violet-400/10",
        },
      ]);
      setLoading(false);
    }, 1000); // simulate 1s loading
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-card border border-border rounded-xl p-6 mb-6 shadow-md"
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
              <div
                key={idx}
                className="flex items-start space-x-3 animate-pulse"
              >
                <Skeleton
                  width={40}
                  height={40}
                  className="rounded-lg flex-shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="50%" height={12} />
                  <Skeleton width="40%" height={12} />
                </div>
                <div className="flex items-center space-x-2">
                  <Skeleton width={60} height={24} count={2} />
                </div>
              </div>
            ))
          : activities?.map((activity) => (
              <div
                key={activity?.id ?? Math.random()}
                className="flex items-start space-x-3"
              >
                <div
                  className={`w-10 h-10 ${
                    activity?.bgColor ?? "bg-gray-200"
                  } rounded-lg flex items-center justify-center flex-shrink-0`}
                >
                  {activity?.icon ? (
                    <Icon
                      name={activity.icon}
                      size={16}
                      className={activity.color}
                    />
                  ) : (
                    <Skeleton width={16} height={16} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {activity?.title ?? <Skeleton width="60%" />}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {activity?.subtitle ?? <Skeleton width="50%" />}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity?.time ?? <Skeleton width="40%" />}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  {activity?.status === "pending" && (
                    <div className="flex space-x-1">
                      <Button variant="outline" size="sm">
                        Decline
                      </Button>
                      <Button variant="default" size="sm">
                        Accept
                      </Button>
                    </div>
                  )}
                  {activity?.status === "confirmed" && (
                    <Button variant="outline" size="sm">
                      <MessageCircle />
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
