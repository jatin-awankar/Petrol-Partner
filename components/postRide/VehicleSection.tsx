"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ChevronUp, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { getVerificationOverview } from "@/lib/api/backend";

// 🔹 Error Boundary to isolate crashes
class VehicleSectionErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("VehicleSection Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl">
          Something went wrong loading the Vehicle section.
        </div>
      );
    }
    return this.props.children;
  }
}

interface VehicleSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
}

const VehicleSection: React.FC<VehicleSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registeredVehicles, setRegisteredVehicles] = useState<any[]>([]);
  const [vehicleLoadError, setVehicleLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const overview = await getVerificationOverview();
        setRegisteredVehicles(
          overview.vehicles
            .filter((vehicle) => vehicle.isVerified && vehicle.status === "active")
            .map((vehicle) => ({
              id: vehicle.id,
              make: vehicle.make,
              model: vehicle.model,
              year: vehicle.year,
              type: "car",
              fuel: vehicle.fuelType,
              color: vehicle.color,
              plateNumber: vehicle.licensePlate,
              features: [],
            })),
        );
        setVehicleLoadError(null);
      } catch (error: any) {
        setVehicleLoadError(
          error?.message || "Unable to load your approved vehicles.",
        );
        setRegisteredVehicles([]);
      } finally {
        setLoading(false);
      }
    };

    void loadVehicles();
  }, []);

  const handleVehicleChange = (field: string, value: any) => {
    updateFormData({
      ...formData,
      vehicle: {
        ...formData?.vehicle,
        [field]: value,
      },
    });
  };

  const handleFeatureToggle = (feature: string) => {
    const features = formData?.vehicle?.features?.includes(feature)
      ? formData?.vehicle?.features?.filter((f: string) => f !== feature)
      : [...(formData?.vehicle?.features || []), feature];
    handleVehicleChange("features", features);
  };

  const vehicleTypes = [
    { value: "sedan", label: "Sedan" },
    { value: "hatchback", label: "Hatchback" },
    { value: "suv", label: "SUV" },
    { value: "crossover", label: "Crossover" },
    { value: "coupe", label: "Coupe" },
    { value: "convertible", label: "Convertible" },
  ];

  const fuelTypes = [
    { value: "petrol", label: "Petrol" },
    { value: "diesel", label: "Diesel" },
    { value: "cng", label: "CNG" },
    { value: "electric", label: "Electric" },
    { value: "hybrid", label: "Hybrid" },
  ];

  const availableFeatures = [
    { id: "ac", label: "Air Conditioning", icon: "Snowflake" },
    { id: "music", label: "Music System", icon: "Music" },
    { id: "charging", label: "Phone Charging", icon: "Battery" },
    { id: "wifi", label: "WiFi Hotspot", icon: "Wifi" },
    { id: "gps", label: "GPS Navigation", icon: "Navigation" },
    { id: "bluetooth", label: "Bluetooth", icon: "Bluetooth" },
  ];

  const selectVehicle = (vehicle: any) => {
    updateFormData({
      ...formData,
      vehicle: {
        ...vehicle,
        selectedId: vehicle?.id,
      },
    });
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse shadow-card">
        <Skeleton height={30} width="40%" />
        <Skeleton height={40} width="100%" count={6} />
        <Skeleton height={120} width="100%" className="rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6 shadow-card">
      <h3 className="text-lg font-semibold text-foreground flex items-center mb-4">
        <Icon name="Car" size={20} className="mr-2 text-primary" />
        Vehicle Information
      </h3>

      {/* Registered Vehicles */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">
          Select Your Vehicle
        </h4>
        {vehicleLoadError ? (
          <p className="text-sm text-red-500 mb-3">{vehicleLoadError}</p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {registeredVehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                formData?.vehicle?.selectedId === vehicle.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => selectVehicle(vehicle)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Icon name="Car" size={16} className="text-primary" />
                  <span className="font-medium text-foreground">
                    {vehicle.make} {vehicle.model}
                  </span>
                </div>
                {formData?.vehicle?.selectedId === vehicle.id && (
                  <Icon name="CheckCircle" size={16} className="text-success" />
                )}
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  {vehicle.year} • {vehicle.color} • {vehicle.fuel}
                </p>
                <p className="font-mono">{vehicle.plateNumber}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {vehicle.features.map((feature: string) => {
                    const info = availableFeatures.find(
                      (f) => f.id === feature
                    );
                    return (
                      <span
                        key={feature}
                        className="inline-flex items-center px-2 py-1 bg-muted rounded text-xs"
                      >
                        <Icon
                          name={info?.icon || "Check"}
                          size={12}
                          className="mr-1"
                        />
                        {info?.label || feature}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
        {!registeredVehicles.length && !vehicleLoadError ? (
          <p className="text-sm text-muted-foreground mt-3">
            No approved vehicles found. Add and get a vehicle approved from profile settings before posting a ride.
          </p>
        ) : null}
      </div>

      {/* Add New Vehicle Form */}
      <div className="border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={() => setShowAddVehicle(!showAddVehicle)}
          disabled
          className="mb-4"
        >
          {showAddVehicle ? <ChevronUp /> : <Plus />}
          Manage vehicles in profile settings
        </Button>

        {showAddVehicle && (
          <div className="bg-muted/30 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Make */}
              <div className="space-y-2">
                <Label>Make</Label>
                <Input
                  type="text"
                  placeholder="e.g., Honda, Toyota"
                  value={formData?.vehicle?.make || ""}
                  onChange={(e) => handleVehicleChange("make", e.target.value)}
                />
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label>Model</Label>
                <Input
                  type="text"
                  placeholder="e.g., City, Camry"
                  value={formData?.vehicle?.model || ""}
                  onChange={(e) => handleVehicleChange("model", e.target.value)}
                />
              </div>

              {/* Year */}
              <div className="space-y-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  placeholder="2020"
                  value={formData?.vehicle?.year || ""}
                  onChange={(e) => handleVehicleChange("year", e.target.value)}
                  min="2000"
                  max={new Date().getFullYear() + 1}
                />
              </div>

              {/* Vehicle Type */}
              <div className="space-y-2">
                <Label>Vehicle Type</Label>
                <Select
                  value={formData?.vehicle?.type || ""}
                  onValueChange={(value) => handleVehicleChange("type", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fuel Type */}
              <div className="space-y-2">
                <Label>Fuel Type</Label>
                <Select
                  value={formData?.vehicle?.fuel || ""}
                  onValueChange={(value) => handleVehicleChange("fuel", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    {fuelTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Color */}
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  type="text"
                  placeholder="e.g., White, Black"
                  value={formData?.vehicle?.color || ""}
                  onChange={(e) => handleVehicleChange("color", e.target.value)}
                />
              </div>
            </div>

            {/* Features */}
            <div>
              <Label>Vehicle Features</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                {availableFeatures.map((feature) => (
                  <Button
                    key={feature.id}
                    variant={
                      formData?.vehicle?.features?.includes(feature.id)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => handleFeatureToggle(feature.id)}
                    className="justify-start"
                  >
                    <Icon name={feature.icon} size={20} className="mr-2" />
                    {feature.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vehicle Photos */}
      <div className="bg-muted/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-foreground mb-3">
          Vehicle Photos (Optional)
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="aspect-square bg-muted border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="text-center">
                <Icon
                  name="Camera"
                  size={24}
                  className="text-muted-foreground mx-auto mb-2"
                />
                <p className="text-xs text-muted-foreground">Add Photo</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Adding photos helps passengers identify your vehicle.
        </p>
      </div>
    </div>
  );
};

// ✅ Export wrapped with Error Boundary
export default function VehicleSectionWithErrorBoundary(
  props: VehicleSectionProps
) {
  return (
    <VehicleSectionErrorBoundary>
      <VehicleSection {...props} />
    </VehicleSectionErrorBoundary>
  );
}
