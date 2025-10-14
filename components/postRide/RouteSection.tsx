"use client";

import React, { useState, useEffect } from "react";
import Icon from "@/components/AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Eye, EyeOff, Navigation } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// Error Boundary
class RouteSectionErrorBoundary extends React.Component<
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
    console.error("RouteSection Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-100 text-red-800 p-4 rounded-xl">
          Something went wrong loading the Route Section.
        </div>
      );
    }
    return this.props.children;
  }
}

// Props
interface RouteSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
}

const RouteSection: React.FC<RouteSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const [showMap, setShowMap] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loading, setLoading] = useState(true);

  // Simulate async loading
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleLocationChange = (field: string, value: string) => {
    updateFormData({
      ...formData,
      route: {
        ...formData.route,
        [field]: value,
      },
    });
  };

  const handleUseCurrentLocation = (field: string) => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        handleLocationChange(
          field,
          `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
        );
        setLoadingLocation(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to fetch your current location.");
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse shadow-card">
        <Skeleton height={30} width={`60%`} className="mb-2" />
        <Skeleton height={20} width={`40%`} className="mb-2" />
        <Skeleton height={40} width="100%" />
        <Skeleton height={40} width="100%" />
        <Skeleton height={40} width="100%" />
        <Skeleton height={160} width="100%" className="rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center">
          <Icon name="MapPin" size={20} className="mr-2 text-primary" />
          Route Details
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMap(!showMap)}
        >
          {showMap ? <EyeOff /> : <Eye />}
          {showMap ? "Hide" : "Show"} Map
        </Button>
      </div>

      {/* Form Inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Pickup */}
            <Label className="mb-2">Pickup Location</Label>
            <Input
              placeholder="Enter pickup address"
              value={formData.route.pickup}
              onChange={(e) => handleLocationChange("pickup", e.target.value)}
              // @ts-expect-error: 'error' prop is custom for our Input component
              error={errors?.pickup}
              required
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUseCurrentLocation("pickup")}
              disabled={loadingLocation}
            >
              <Navigation />
              {loadingLocation ? "Fetching..." : "Use Current Location"}
            </Button>

          {/* Dropoff */}
            <Label className="mb-2">Drop-off Location</Label>
            <Input
              placeholder="Enter destination address"
              value={formData.route.dropoff}
              onChange={(e) => handleLocationChange("dropoff", e.target.value)}
              // @ts-expect-error: 'error' prop is custom for our Input component
              error={errors?.dropoff}
              required
            />

          {/* Via */}
            <Label className="mb-2">Via (Optional)</Label>
            <Input
              placeholder="Any stops along the way"
              value={formData.route.via}
              onChange={(e) => handleLocationChange("via", e.target.value)}
            />

          {/* Estimated Route Info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center text-sm text-muted-foreground mb-2">
              <Icon name="Route" size={16} className="mr-2" />
              Estimated Route Info
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Distance:</span>
                <span className="ml-2 font-medium text-foreground">~25 km</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-2 font-medium text-foreground">
                  ~35 min
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Map */}
        {showMap && (
          <div className="lg:block">
            <div className="bg-muted rounded-lg h-64 lg:h-80 flex items-center justify-center">
              <iframe
                width="100%"
                height="100%"
                loading="lazy"
                title="Route Map"
                referrerPolicy="no-referrer-when-downgrade"
                src="https://www.google.com/maps?q=28.6139,77.2090&z=12&output=embed"
                className="rounded-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Interactive map will show your route once locations are entered
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Export wrapped with error boundary
export default function RouteSectionWithErrorBoundary(
  props: RouteSectionProps
) {
  return (
    <RouteSectionErrorBoundary>
      <RouteSection {...props} />
    </RouteSectionErrorBoundary>
  );
}
