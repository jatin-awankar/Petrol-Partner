// components/ride/DriverPreferences.tsx
import React from "react";

interface DriverPreferences {
  music?: string;
  conversation?: string;
  pets?: string;
  smoking?: string;
  notes?: string;
}

export default function DriverPreferences({
  preferences,
}: {
  preferences?: DriverPreferences;
}) {
  if (!preferences) return null;

  return (
    <div className="p-4 bg-card rounded-xl">
      <h4 className="font-semibold mb-2">Driver Preferences</h4>
      <div className="text-sm text-muted-foreground space-y-1">
        <div>
          <strong>Music:</strong> {preferences.music}
        </div>
        <div>
          <strong>Conversation:</strong> {preferences.conversation}
        </div>
        <div>
          <strong>Pets:</strong> {preferences.pets}
        </div>
        <div>
          <strong>Smoking:</strong> {preferences.smoking}
        </div>
        <div>
          <strong>Notes:</strong> {preferences.notes}
        </div>
      </div>
    </div>
  );
}
