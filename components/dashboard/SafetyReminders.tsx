"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { Button } from "../ui/button";
import Icon from "../AppIcon";

const SafetyReminders: React.FC = () => {
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);

  useEffect(() => {
    setReminders([
      {
        id: "verify-driver",
        title: "Verify your vehicle",
        message:
          "Add your vehicle details to get a driver verification badge.",
        icon: "Shield",
        color: "text-primary",
        bgColor: "bg-primary/10",
        priority: "high",
      },
      {
        id: "share-location",
        title: "Share trip details",
        message:
          "Send your ride link to a friend or family before departure.",
        icon: "MapPin",
        color: "text-success",
        bgColor: "bg-success/10",
        priority: "medium",
      },
      {
        id: "emergency-contacts",
        title: "Update emergency contacts",
        message: "Keep emergency contacts current inside your profile.",
        icon: "Phone",
        color: "text-warning",
        bgColor: "bg-warning/10",
        priority: "high",
      },
    ]);
  }, []);

  const visibleReminders = reminders?.filter(
    (reminder) => !dismissedReminders.includes(reminder?.id ?? "")
  );

  const dismissReminder = (reminderId?: string) => {
    if (reminderId) setDismissedReminders((prev) => [...prev, reminderId]);
  };

  if (!visibleReminders?.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-soft"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <Icon name="AlertTriangle" size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Safety reminders</h2>
          <p className="text-xs text-muted-foreground">Quick checks before each ride</p>
        </div>
      </div>

      <div className="space-y-3">
        {visibleReminders?.map((reminder) => (
          <div
            key={reminder?.id}
            className="rounded-xl border border-border bg-muted/40 p-4"
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
    </motion.section>
  );
};

export default SafetyReminders;
