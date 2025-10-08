"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ChevronUp, Plus } from "lucide-react";
import { Select } from "../ui/select";
import { Label } from "../ui/label";

// Error Boundary
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
        <div className="bg-red-100 text-red-800 p-4 rounded-xl">
          Something went wrong loading the Vehicle section.
        </div>
      );
    }
    return this.props.children;
  }
}

// Props interface
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

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
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
      : [...formData?.vehicle?.features, feature];
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

  // Mock registered vehicles
  const registeredVehicles = [
    {
      id: 1,
      make: "Honda",
      model: "City",
      year: "2022",
      type: "sedan",
      fuel: "petrol",
      color: "White",
      plateNumber: "DL 01 AB 1234",
      features: ["ac", "music", "charging"],
    },
    {
      id: 2,
      make: "Maruti",
      model: "Swift",
      year: "2021",
      type: "hatchback",
      fuel: "petrol",
      color: "Red",
      plateNumber: "DL 02 CD 5678",
      features: ["ac", "music"],
    },
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
      <div className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse">
        <Skeleton height={30} width="40%" />
        <Skeleton height={40} width="100%" count={6} />
        <Skeleton height={120} width="100%" className="rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground flex items-center mb-4">
        <Icon name="Car" size={20} className="mr-2 text-primary" />
        Vehicle Information
      </h3>

      <div className="space-y-6">
        {/* Registered Vehicles */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">
            Select Your Vehicle
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {registeredVehicles?.map((vehicle) => (
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
                    <Icon
                      name="CheckCircle"
                      size={16}
                      className="text-success"
                    />
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    {vehicle.year} • {vehicle.color} • {vehicle.fuel}
                  </p>
                  <p className="font-mono">{vehicle.plateNumber}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {vehicle.features.map((feature) => {
                      const featureInfo = availableFeatures.find(
                        (f) => f.id === feature
                      );
                      return (
                        <span
                          key={feature}
                          className="inline-flex items-center px-2 py-1 bg-muted rounded text-xs"
                        >
                          <Icon
                            name={featureInfo?.icon || "Check"}
                            size={12}
                            className="mr-1"
                          />
                          {featureInfo?.label || feature}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add New Vehicle */}
        <div className="border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => setShowAddVehicle(!showAddVehicle)}
            className="mb-4"
          >
            {showAddVehicle ? <ChevronUp /> : <Plus />}
            {showAddVehicle ? "Hide Form" : "Add New Vehicle"}
          </Button>

          {showAddVehicle && (
            <div className="bg-muted/30 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Label>Make</Label>
                <Input
                  type="text"
                  placeholder="e.g., Honda, Toyota"
                  value={formData?.vehicle?.make}
                  onChange={(e) => handleVehicleChange("make", e.target.value)}
                  // @ts-expect-error: 'label' prop is custom for our Input component
                  error={errors?.make}
                />

                <Label>Model</Label>
                <Input
                  type="text"
                  placeholder="e.g., City, Camry"
                  value={formData?.vehicle?.model}
                  onChange={(e) => handleVehicleChange("model", e.target.value)}
                  // @ts-expect-error: 'label' prop is custom for our Input component
                  error={errors?.model}
                />

                <Label>Year</Label>
                <Input
                  type="number"
                  placeholder="2020"
                  value={formData?.vehicle?.year}
                  onChange={(e) => handleVehicleChange("year", e.target.value)}
                  min="2000"
                  max={new Date().getFullYear() + 1}
                />

                <Label>Vehicle Type</Label>
                <Select
                  // @ts-expect-error: 'error' prop is custom for our Input component
                  options={vehicleTypes}
                  value={formData?.vehicle?.type}
                  onChange={(value: string) =>
                    handleVehicleChange("type", value)
                  }
                  placeholder="Select vehicle type"
                />

                <Label>Fuel Type</Label>
                <Select
                  // @ts-expect-error: 'error' prop is custom for our Input component
                  options={fuelTypes}
                  value={formData?.vehicle?.fuel}
                  onChange={(value: string) =>
                    handleVehicleChange("fuel", value)
                  }
                  placeholder="Select fuel type"
                />

                <Label>Color</Label>
                <Input
                  type="text"
                  placeholder="e.g., White, Black"
                  value={formData?.vehicle?.color}
                  onChange={(e) => handleVehicleChange("color", e.target.value)}
                />
              </div>

              {/* Vehicle Features */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Vehicle Features
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                      <Icon name={feature.icon} size={20} />
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
            Adding photos helps passengers identify your vehicle
          </p>
        </div>
      </div>
    </div>
  );
};

// Export with error boundary
export default function VehicleSectionWithErrorBoundary(
  props: VehicleSectionProps
) {
  return (
    <VehicleSectionErrorBoundary>
      <VehicleSection {...props} />
    </VehicleSectionErrorBoundary>
  );
}
