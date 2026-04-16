"use client";

import React from "react";
import Icon from "../AppIcon";
import { SkeletonBlock } from "@/components/searchRides/SearchRidesSkeletons";

interface DriverPreferencesProps {
  preferences?: Record<string, string>;
}

const DriverPreferences: React.FC<DriverPreferencesProps> = ({
  preferences,
}) => {
  const isLoading = !preferences;

  const getPreferenceIcon = (type: string) => {
    switch (type) {
      case "music":
        return "Music";
      case "conversation":
        return "MessageCircle";
      case "pets":
        return "Heart";
      case "smoking":
        return "Ban";
      case "food":
        return "Utensils";
      default:
        return "Info";
    }
  };

  const getPreferenceColor = (value: string | null | undefined) => {
    if (!value || typeof value !== "string") return "text-muted-foreground";
    const lowerValue = value.toLowerCase();
    if (lowerValue.includes("no") || lowerValue.includes("not allowed"))
      return "text-destructive";
    if (lowerValue.includes("yes") || lowerValue.includes("allowed"))
      return "text-success";
    return "text-foreground";
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 md:p-5 shadow-soft space-y-3">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="h-20 w-full" />
      </div>
    );
  }

  if (!preferences || Object.keys(preferences).length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 md:p-5 shadow-soft">
        <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">
          Trip preferences
        </h3>
        <p className="text-sm text-muted-foreground">
          No preferences specified.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 md:p-5 shadow-soft">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3">
        Trip preferences
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {Object.entries(preferences)
          .filter(
            ([key, value]) =>
              key !== "notes" &&
              value !== null &&
              value !== undefined &&
              value !== "",
          )
          .map(([key, value]) => (
            <div
              key={key}
              className="rounded-xl border border-border/70 bg-card/90 p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center">
                  <Icon
                    name={getPreferenceIcon(key)}
                    size={15}
                    className="text-muted-foreground"
                  />
                </div>
                <span className="text-sm font-medium text-foreground capitalize truncate">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
              </div>
              <span
                className={`text-sm font-medium ${getPreferenceColor(String(value))}`}
              >
                {value || "-"}
              </span>
            </div>
          ))}
      </div>

      {preferences?.notes && (
        <div className="mt-3 rounded-xl border border-border/70 bg-card/90 p-3">
          <div className="flex items-start gap-2">
            <Icon
              name="MessageSquare"
              size={15}
              className="text-muted-foreground mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Additional notes
              </p>
              <p className="text-sm text-muted-foreground">
                {preferences.notes}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DriverPreferences;
