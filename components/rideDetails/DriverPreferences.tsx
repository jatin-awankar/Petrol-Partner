"use client";

import React from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";

interface DriverPreferencesProps {
  preferences?: Record<string, string>;
}

const DriverPreferences: React.FC<DriverPreferencesProps> = ({
  preferences,
}) => {
  const isLoading = !preferences;

  const preferenceKeys = ["music", "conversation", "pets", "smoking", "food"];

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
        return "Coffee";
      default:
        return "Info";
    }
  };

  const getPreferenceColor = (value: string) => {
    if (!value) return "text-muted-foreground";
    if (
      value.toLowerCase().includes("no") ||
      value.toLowerCase().includes("not allowed")
    )
      return "text-error";
    if (
      value.toLowerCase().includes("yes") ||
      value.toLowerCase().includes("allowed")
    )
      return "text-success";
    return "text-foreground";
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg p-4 border border-border shadow-soft space-y-3">
        <Skeleton height={28} width={180} /> {/* Title */}
        {preferenceKeys.map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Skeleton circle height={32} width={32} />
              <Skeleton height={16} width={100} />
            </div>
            <Skeleton height={16} width={40} />
          </div>
        ))}
        <Skeleton height={60} /> {/* Additional notes */}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-4 border border-border shadow-soft">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Driver Preferences
      </h3>
      <div className="space-y-3">
        {Object.entries(preferences).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                <Icon
                  name={getPreferenceIcon(key)}
                  size={16}
                  className="text-muted-foreground"
                />
              </div>
              <span className="text-sm font-medium text-foreground capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
            </div>
            <span
              className={`text-sm font-medium ${getPreferenceColor(value)}`}
            >
              {value || "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Additional Notes */}
      {preferences?.notes && (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-start space-x-2">
            <Icon
              name="MessageSquare"
              size={16}
              className="text-muted-foreground mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">
                Additional Notes
              </p>
              <p className="text-sm text-muted-foreground">
                {preferences.notes}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPreferences;
