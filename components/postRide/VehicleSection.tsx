"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Icon from "../AppIcon";
import type { PostRideFormData } from "@/lib/post-ride";
import { getVerificationOverview } from "@/lib/api/backend";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

type ApprovedVehicle = {
  id: string;
  make: string;
  model: string;
  year: string;
  fuel: string;
  color: string;
  plateNumber: string;
};

interface VehicleSectionProps {
  formData: PostRideFormData;
  updateFormData: React.Dispatch<React.SetStateAction<PostRideFormData>>;
  errors: Record<string, string>;
}

const VehicleSection: React.FC<VehicleSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<ApprovedVehicle[]>([]);
  const [vehicleLoadError, setVehicleLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const overview = await getVerificationOverview();
        const approvedVehicles = overview.vehicles
          .filter((vehicle) => vehicle.isVerified && vehicle.status === "active")
          .map((vehicle) => ({
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            fuel: vehicle.fuelType,
            color: vehicle.color,
            plateNumber: vehicle.licensePlate,
          }));

        setVehicles(approvedVehicles);
        setVehicleLoadError(null);
      } catch (error: unknown) {
        const safeError = error as { message?: string };
        setVehicleLoadError(safeError.message || "Unable to load approved vehicles.");
      } finally {
        setLoading(false);
      }
    };

    void loadVehicles();
  }, []);

  const selectVehicle = (vehicle: ApprovedVehicle) => {
    updateFormData((prev) => ({
      ...prev,
      vehicle: {
        ...prev.vehicle,
        ...vehicle,
        selectedId: vehicle.id,
      },
    }));
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <p className="text-sm text-muted-foreground">Loading approved vehicles...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 md:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
            <Icon name="Car" size={18} className="text-primary" />
            Select approved vehicle
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ride offers can only be posted with active, approved vehicles.
          </p>
        </div>
        <Badge variant="outline">{vehicles.length} available</Badge>
      </div>

      {vehicleLoadError ? <p className="text-sm text-destructive">{vehicleLoadError}</p> : null}

      {vehicles.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {vehicles.map((vehicle) => {
            const active = formData.vehicle.selectedId === vehicle.id;
            return (
              <button
                key={vehicle.id}
                type="button"
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-background/80 hover:border-primary/40"
                }`}
                onClick={() => selectVehicle(vehicle)}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {vehicle.make} {vehicle.model}
                  </p>
                  {active ? (
                    <Badge className="bg-success/20 text-success border-success/40">Selected</Badge>
                  ) : (
                    <Badge variant="outline">Approved</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {vehicle.year} • {vehicle.color} • {vehicle.fuel}
                </p>
                <p className="mt-1 text-xs font-mono text-muted-foreground">{vehicle.plateNumber}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No approved vehicles available yet.
        </div>
      )}

      {errors.vehicle ? <p className="text-xs text-destructive">{errors.vehicle}</p> : null}

      <div className="flex justify-stretch sm:justify-end">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => router.push("/profile-settings")}
        >
          Manage vehicles in profile
        </Button>
      </div>
    </div>
  );
};

export default VehicleSection;
