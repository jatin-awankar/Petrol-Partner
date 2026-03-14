import React, { useState, useCallback, useMemo } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import AppImage from "../AppImage";
import { Button } from "../ui/button";
import { Edit, Plus, Save, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

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
  onAddVehicle?: (vehicle: { licensePlate: string }) => void | Promise<void>;
  onEditVehicle?: (id: string | number, vehicle: Omit<Vehicle, "id">) => void | Promise<void>;
  onDeleteVehicle?: (id: string | number) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const DEFAULT_VEHICLE_FORM = {
  licensePlate: "",
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
  const [formData, setFormData] = useState<{ licensePlate: string }>(DEFAULT_VEHICLE_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isLoading = externalLoading;
  const displayedVehicles = vehicles ?? [];

  const handleInputChange = useCallback((value: string) => {
    setFormData({ licensePlate: value });
    setFormError(null);
  }, []);

  const validateForm = useCallback((): boolean => {
    if (!formData.licensePlate?.trim()) {
      setFormError("Vehicle number is required");
      return false;
    }
    return true;
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (onAddVehicle) {
        await onAddVehicle(formData);
      }
      setShowAddForm(false);
      setEditingVehicle(null);
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

    setFormData({ licensePlate: vehicle.licensePlate ?? "" });
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

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="Bike" size={20} className="text-primary" />
            <Skeleton width={160} height={20} className="rounded" />
          </div>
          <Skeleton width={20} height={20} className="rounded" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton width={64} height={64} className="rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton width="75%" height={16} className="rounded" />
                  <Skeleton width="50%" height={12} className="rounded" />
                  <Skeleton width="33.33%" height={12} className="rounded" />
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
                                .join(" - ") || "No details"}
                            </p>
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                              {vehicle.seats && (
                                <span className="flex items-center space-x-1">
                                  <Icon name="Users" size={18} className="text-blue-400" />
                                  <span>{vehicle.seats} seats</span>
                                </span>
                              )}
                              {vehicle.fuelType && (
                                <span className="flex items-center space-x-1">
                                  <Icon name="Fuel" size={14} className="text-purple-400" />
                                  <span className="capitalize">{vehicle.fuelType}</span>
                                </span>
                              )}
                              {vehicle.isVerified && (
                                <span className="flex items-center space-x-1 text-success">
                                  <Icon name="CheckCircle" size={16} className="text-success" />
                                  <span className="hidden md:inline">Verified</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {false && onEditVehicle && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(vehicle)}
                                title="Edit vehicle"
                              >
                                <Edit className="text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
                              </Button>
                            )}
                            {false && onDeleteVehicle && (
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

          {showAddForm ? (
            <div className="border border-border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-4">
                Add New Vehicle
              </h4>

              {formError && (
                <div className="mb-4 p-2 bg-error/10 border border-error/20 rounded text-sm text-error">
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="licensePlate">Vehicle Number *</Label>
                <Input
                  id="licensePlate"
                  type="text"
                  placeholder="e.g., MH12AB1234"
                  value={formData.licensePlate}
                  onChange={(e) => handleInputChange(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  We'll fetch make, model, fuel, and seating details automatically.
                </p>
              </div>

              <div className="flex space-x-3 mt-6">
                {onAddVehicle && (
                  <Button
                    variant="default"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Icon name="Loader" className="animate-spin mr-2" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save />
                        Add Vehicle
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
