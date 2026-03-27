import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import AppImage from "../AppImage";
import { Button } from "../ui/button";
import { Edit, Plus, Save, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export interface Vehicle {
  id: string | number;
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  seats: string;
  fuelType: string;
  photo?: string;
  isVerified?: boolean;
}

export interface VehicleInfoSectionProps {
  vehicles?: Vehicle[] | null;
  onAddVehicle?: (vehicle: Omit<Vehicle, "id">) => void | Promise<void>;
  onEditVehicle?: (id: string | number, vehicle: Omit<Vehicle, "id">) => void | Promise<void>;
  onDeleteVehicle?: (id: string | number) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const DEFAULT_VEHICLE_FORM: Omit<Vehicle, "id"> = {
  make: "",
  model: "",
  year: "",
  color: "",
  licensePlate: "",
  seats: "",
  fuelType: "",
  photo: "",
  isVerified: false,
};

const VehicleInfoSection: React.FC<VehicleInfoSectionProps> = ({
  vehicles = null,
  onAddVehicle,
  onEditVehicle,
  onDeleteVehicle,
  isExpanded,
  onToggle,
  isLoading: externalLoading = false,
  error: externalError = null,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<Omit<Vehicle, "id">>(DEFAULT_VEHICLE_FORM);
  const [isInternalLoading, setIsInternalLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isLoading = externalLoading || isInternalLoading;
  const displayedVehicles = vehicles ?? [];

  const fuelTypeOptions = useMemo(
    () => [
      { value: "petrol", label: "Petrol" },
      { value: "diesel", label: "Diesel" },
      { value: "cng", label: "CNG" },
      { value: "electric", label: "Electric" },
      { value: "hybrid", label: "Hybrid" },
    ],
    []
  );

  const seatOptions = useMemo(
    () => [
      { value: "2", label: "2 Seats" },
      { value: "4", label: "4 Seats" },
      { value: "5", label: "5 Seats" },
      { value: "7", label: "7 Seats" },
      { value: "8", label: "8+ Seats" },
    ],
    []
  );

  // Initialize loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInternalLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleInputChange = useCallback((field: keyof Omit<Vehicle, "id">, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }, []);

  const validateForm = useCallback((): boolean => {
    if (!formData.make?.trim()) {
      setFormError("Make is required");
      return false;
    }
    if (!formData.model?.trim()) {
      setFormError("Model is required");
      return false;
    }
    if (!formData.year?.trim()) {
      setFormError("Year is required");
      return false;
    }
    if (!formData.color?.trim()) {
      setFormError("Color is required");
      return false;
    }
    if (!formData.licensePlate?.trim()) {
      setFormError("License plate is required");
      return false;
    }
    if (!formData.seats?.trim()) {
      setFormError("Number of seats is required");
      return false;
    }
    if (!formData.fuelType?.trim()) {
      setFormError("Fuel type is required");
      return false;
    }
    return true;
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingVehicle) {
        if (onEditVehicle) {
          await onEditVehicle(editingVehicle.id, formData);
        }
        setEditingVehicle(null);
      } else {
        if (onAddVehicle) {
          await onAddVehicle(formData);
        }
        setShowAddForm(false);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save vehicle. Please try again.");
      console.error("Vehicle save error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingVehicle, validateForm, onAddVehicle, onEditVehicle]);

  const handleEdit = useCallback((vehicle: Vehicle) => {
    if (!vehicle?.id) return;

    setFormData({
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ?? "",
      color: vehicle.color ?? "",
      licensePlate: vehicle.licensePlate ?? "",
      seats: vehicle.seats ?? "",
      fuelType: vehicle.fuelType ?? "",
      photo: vehicle.photo ?? "",
      isVerified: vehicle.isVerified ?? false,
    });
    setEditingVehicle(vehicle);
    setShowAddForm(true);
    setFormError(null);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(DEFAULT_VEHICLE_FORM);
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowAddForm(false);
    setEditingVehicle(null);
    resetForm();
  }, [resetForm]);

  const handleDelete = useCallback(async (id: string | number) => {
    if (!id || !onDeleteVehicle) return;

    if (window.confirm("Are you sure you want to delete this vehicle?")) {
      try {
        await onDeleteVehicle(id);
      } catch (err) {
        console.error("Failed to delete vehicle:", err);
        alert("Failed to delete vehicle. Please try again.");
      }
    }
  }, [onDeleteVehicle]);

  // Skeleton loader
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="Bike" size={20} className="text-primary" />
            <Skeleton
              width={160}
              height={20}
              className="rounded animate-bounce"
            />
          </div>
          <Skeleton width={20} height={20} className="rounded animate-bounce" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton
                  width={64}
                  height={64}
                  className="rounded-lg animate-pulse"
                />
                <div className="flex-1 space-y-2">
                  <Skeleton
                    width="75%"
                    height={16}
                    className="rounded animate-pulse"
                  />
                  <Skeleton
                    width="50%"
                    height={12}
                    className="rounded animate-pulse"
                  />
                  <Skeleton
                    width="33.33%"
                    height={12}
                    className="rounded animate-pulse"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-card">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Icon name="Bike" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Vehicle Information</h3>
          {displayedVehicles.length > 0 && (
            <span className="bg-yellow-500/10 text-yellow-600 text-xs px-2 py-1 rounded-full">
              {displayedVehicles.length} vehicle{displayedVehicles.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground"
        />
      </button>
      {/* Content */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 border-t border-border pt-4">
          {externalError && (
            <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{externalError}</p>
            </div>
          )}

          {/* Vehicle List */}
          {displayedVehicles.length > 0 ? (
            <div className="space-y-4 mb-6">
              {displayedVehicles.map((vehicle) => {
                if (!vehicle?.id) return null;

                return (
                  <div
                    key={vehicle.id}
                    className="border border-border rounded-lg p-4"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                        {vehicle.photo ? (
                          <AppImage
                            src={vehicle.photo}
                            alt={`${vehicle.make ?? "Vehicle"} ${vehicle.model ?? ""}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon name="Bike" size={24} className="text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-foreground truncate">
                              {[vehicle.make, vehicle.model, vehicle.year && `(${vehicle.year})`]
                                .filter(Boolean)
                                .join(" ") || "Unknown Vehicle"}
                            </h4>
                            <p className="text-sm text-muted-foreground truncate">
                              {[vehicle.color, vehicle.licensePlate]
                                .filter(Boolean)
                                .join(" • ") || "No details"}
                            </p>
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                              {vehicle.seats && (
                                <span className="flex items-center space-x-1">
                                  <Icon
                                    name="Users"
                                    size={18}
                                    className="text-blue-400 fill-current"
                                  />
                                  <span>{vehicle.seats} seats</span>
                                </span>
                              )}
                              {vehicle.fuelType && (
                                <span className="flex items-center space-x-1">
                                  <Icon
                                    name="Fuel"
                                    size={14}
                                    className="text-purple-400"
                                  />
                                  <span className="capitalize">{vehicle.fuelType}</span>
                                </span>
                              )}
                              {vehicle.isVerified && (
                                <span className="flex items-center space-x-1 text-success">
                                  <Icon
                                    name="CheckCircle"
                                    size={16}
                                    className="text-success fill-current"
                                  />
                                  <span className="hidden md:inline">Verified</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {onEditVehicle && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(vehicle)}
                                title="Edit vehicle"
                              >
                                <Edit className="text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
                              </Button>
                            )}
                            {onDeleteVehicle && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(vehicle.id)}
                                title="Delete vehicle"
                                className="text-error hover:text-error"
                              >
                                <Trash2 className="text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            !showAddForm && (
              <div className="mb-6 p-8 border border-border rounded-lg text-center">
                <Icon name="Bike" size={48} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No vehicles added yet
                </p>
              </div>
            )
          )}

          {/* Add/Edit Vehicle Form */}
          {showAddForm ? (
            <div className="border border-border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-4">
                {editingVehicle ? "Edit Vehicle" : "Add New Vehicle"}
              </h4>

              {formError && (
                <div className="mb-4 p-2 bg-error/10 border border-error/20 rounded text-sm text-error">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">Make *</Label>
                  <Input
                    id="make"
                    type="text"
                    placeholder="e.g., Honda"
                    value={formData.make}
                    onChange={(e) => handleInputChange("make", e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model *</Label>
                  <Input
                    id="model"
                    type="text"
                    placeholder="e.g., Civic"
                    value={formData.model}
                    onChange={(e) => handleInputChange("model", e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year *</Label>
                  <Input
                    id="year"
                    type="number"
                    placeholder="e.g., 2020"
                    value={formData.year}
                    onChange={(e) => handleInputChange("year", e.target.value)}
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Color *</Label>
                  <Input
                    id="color"
                    type="text"
                    placeholder="e.g., White"
                    value={formData.color}
                    onChange={(e) => handleInputChange("color", e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licensePlate">License Plate *</Label>
                  <Input
                    id="licensePlate"
                    type="text"
                    placeholder="e.g., MH12AB1234"
                    value={formData.licensePlate}
                    onChange={(e) => handleInputChange("licensePlate", e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seats">Max Seats *</Label>
                  <Select
                    value={formData.seats}
                    onValueChange={(value) => handleInputChange("seats", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="seats">
                      <SelectValue placeholder="Select Seats" />
                    </SelectTrigger>
                    <SelectContent>
                      {seatOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fuelType">Fuel Type *</Label>
                  <Select
                    value={formData.fuelType}
                    onValueChange={(value) => handleInputChange("fuelType", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="fuelType">
                      <SelectValue placeholder="Select Fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      {fuelTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo">Vehicle Photo URL</Label>
                  <Input
                    id="photo"
                    type="url"
                    placeholder="https://example.com/car-photo.jpg"
                    value={formData.photo}
                    onChange={(e) => handleInputChange("photo", e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                {(onAddVehicle || onEditVehicle) && (
                  <Button
                    variant="default"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Icon name="Loader" className="animate-spin mr-2" />
                        {editingVehicle ? "Updating..." : "Adding..."}
                      </>
                    ) : (
                      <>
                        <Save />
                        {editingVehicle ? "Update Vehicle" : "Add Vehicle"}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            onAddVehicle && (
              <Button
                variant="outline"
                onClick={() => setShowAddForm(true)}
                className="w-full"
              >
                <Plus />
                Add New Vehicle
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleInfoSection;
