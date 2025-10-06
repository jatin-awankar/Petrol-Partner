// components/ride/RideInformation.tsx
import React from "react";

export default function RideInformation({ ride }: { ride?: RideOffer }) {
  if (!ride) return null;

  return (
    <div className="p-4 bg-card rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold">Trip Details</h4>
          <p className="text-sm text-muted-foreground">{ride.origin_address} → {ride.destination_address}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Depart</div>
          <div className="font-semibold">{new Date(ride.departure_time).toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Seats</div>
          <div>{ride.available_seats} available</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Price</div>
          <div>₹{ride.price_per_seat}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Distance</div>
          <div>{ride.total_distance_km ?? "—"} km</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Duration</div>
          <div>{ride.estimated_duration_minutes ?? "—"} mins</div>
        </div>
      </div>
    </div>
  );
}
