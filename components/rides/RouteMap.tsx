// components/ride/RouteMap.tsx
import React from "react";

export default function RouteMap({ route }: { route: any | null }) {
  if (!route) {
    return <div className="h-48 bg-muted rounded-xl" />;
  }

  // Replace with Mapbox / Google Maps embedding or Map component you have
  const pickup = route.pickup?.address ?? "Pickup";
  const dropoff = route.dropoff?.address ?? "Dropoff";

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div className="h-48 w-full bg-[linear-gradient(90deg,#e6f5ff, #f0fdf4)] flex items-center justify-center text-sm">
        Map placeholder — {pickup} → {dropoff}
      </div>
    </div>
  );
}
