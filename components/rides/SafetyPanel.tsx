// components/ride/SafetyPanel.tsx
import React from "react";

export default function SafetyPanel({
  onEmergencyContact,
  onShareLocation,
  onReportIssue,
}: {
  onEmergencyContact?: () => void;
  onShareLocation?: () => void;
  onReportIssue?: () => void;
}) {
  return (
    <div className="p-4 bg-card rounded-xl">
      <h4 className="font-semibold mb-2">Safety</h4>
      <div className="space-y-2">
        <button className="btn-ghost w-full" onClick={onEmergencyContact}>
          Emergency Contact
        </button>
        <button className="btn-ghost w-full" onClick={onShareLocation}>
          Share Location
        </button>
        <button className="btn-ghost w-full" onClick={onReportIssue}>
          Report an Issue
        </button>
      </div>
    </div>
  );
}
