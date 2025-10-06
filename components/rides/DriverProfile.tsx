// components/ride/DriverProfile.tsx
import React from "react";
import Image from "next/image";
import { GraduationCap, Star } from "lucide-react";

export default function DriverProfile({
  driver,
  loading,
}: {
  driver?: Profile;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="p-4 bg-card rounded-xl animate-pulse">
        <div className="h-28 bg-muted rounded" />
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="p-4 bg-card rounded-xl flex items-center gap-4">
      <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center">
        {driver?.avatar_url ? (
          <Image
            src={driver.avatar_url}
            alt={driver.full_name}
            fill
            className="object-cover"
          />
        ) : (
          <GraduationCap className="w-8 h-8 text-white" />
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{driver.full_name}</h3>
          {/* verified */}
          {driver.is_verified ? (
            <span className="text-sm text-green-500">Verified</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{driver.college}</p>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Star size={14} className="text-yellow-400" />
          <span>{Number(driver.avg_rating ?? 0).toFixed(1)}</span>
          <span>•</span>
          {/* <span>{driver.total_rides ?? 0} rides</span> */}
        </div>
      </div>
    </div>
  );
}
