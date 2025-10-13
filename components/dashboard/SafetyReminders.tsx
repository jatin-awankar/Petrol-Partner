"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import { motion } from "framer-motion";

interface Reminder {
  id: string;
  title: string;
  message: string;
  icon: string;
  color: string;
  bgColor: string;
  priority: "high" | "medium";
}

const SafetyReminders: React.FC = () => {
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setReminders([
        {
          id: "verify-driver",
          title: "Verify Driver Details",
          message:
            "Always check driver verification badges and vehicle details before booking.",
          icon: "Shield",
          color: "text-primary",
          bgColor: "bg-primary/10",
          priority: "high",
        },
        {
          id: "share-location",
          title: "Share Your Trip",
          message:
            "Share your ride details with friends or family for added safety.",
          icon: "MapPin",
          color: "text-success",
          bgColor: "bg-success/10",
          priority: "medium",
        },
        {
          id: "emergency-contacts",
          title: "Emergency Contacts",
          message: "Keep emergency contacts updated in your profile settings.",
          icon: "Phone",
          color: "text-error",
          bgColor: "bg-error/10",
          priority: "high",
        },
      ]);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const visibleReminders = reminders?.filter(
    (reminder) => !dismissedReminders.includes(reminder?.id ?? "")
  );

  const dismissReminder = (reminderId?: string) => {
    if (reminderId) setDismissedReminders((prev) => [...prev, reminderId]);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Skeleton width={20} height={20} circle />
          <Skeleton width={120} height={20} />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="border border-border/50 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Skeleton width={32} height={32} circle />
                <div className="flex-1 space-y-1">
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="90%" height={12} />
                </div>
              </div>
              <Skeleton width="80%" height={20} className="mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!visibleReminders?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-card border border-border rounded-xl p-6 mb-6 shadow-soft"
    >
      <div className="flex items-center space-x-2 mb-4">
        <Icon name="AlertTriangle" size={20} className="text-warning" />
        <h2 className="text-lg font-semibold text-foreground">
          Safety Reminders
        </h2>
      </div>

      <div className="space-y-3">
        {visibleReminders?.map((reminder) => (
          <div
            key={reminder?.id}
            className={`${
              reminder?.bgColor ?? "bg-muted"
            } border border-border/50 rounded-lg p-4`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="w-8 h-8 bg-card rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon
                    name={reminder?.icon ?? "Info"}
                    size={16}
                    className={reminder?.color ?? "text-foreground"}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-foreground mb-1">
                    {reminder?.title ?? "-"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {reminder?.message ?? ""}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissReminder(reminder?.id)}
                className="ml-2 flex-shrink-0"
              >
                <Icon name="X" size={14} />
              </Button>
            </div>

            {reminder?.priority === "high" && (
              <div className="mt-3 flex space-x-2">
                <Button variant="outline" size="sm">
                  Learn More
                </Button>
                <Button variant="default" size="sm">
                  Update Now
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default SafetyReminders;
