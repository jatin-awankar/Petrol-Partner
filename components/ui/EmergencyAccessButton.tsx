// components/ui/EmergencyAccessButton.tsx
import React from "react";

export default function EmergencyAccessButton({
  onEmergencyCall,
  onShareLocation,
  onContactSupport,
}: {
  onEmergencyCall?: () => void;
  onShareLocation?: () => void;
  onContactSupport?: () => void;
}) {
  return (
    <div className="fixed right-4 bottom-20 z-50">
      <button
        onClick={() => {
          // default behavior if not provided
          onEmergencyCall?.();
        }}
        className="bg-red-600 text-white px-4 py-3 rounded-full shadow-lg"
        title="Emergency"
      >
        SOS
      </button>
    </div>
  );
}
