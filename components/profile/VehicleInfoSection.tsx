import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import Icon from "../AppIcon";
import AppImage from "../AppImage";
import Skeleton from "react-loading-skeleton";
import { Edit, Plus, Save, Trash2 } from "lucide-react";

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
  onEditVehicle?: (
    id: string | number,
    vehicle: Omit<Vehicle, "id">,
  ) => void | Promise<void>;
  onDeleteVehicle?: (id: string | number) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_FORM: Omit<Vehicle, "id"> = {
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

const seatOptions = ["2", "4", "5", "7", "8"];
const fuelOptions = ["petrol", "diesel", "cng", "electric", "hybrid"];

const VehicleInfoSection: React.FC<VehicleInfoSectionProps> = ({
  vehicles = [],
  onAddVehicle,
  onEditVehicle,
  onDeleteVehicle,
  isExpanded,
  onToggle,
  isLoading = false,
  error = null,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<Omit<Vehicle, "id">>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm) {
      setFormData(EMPTY_FORM);
      setEditing(null);
      setFormError(null);
    }
  }, [showForm]);

  const displayedVehicles = useMemo(() => vehicles ?? [], [vehicles]);

  const validate = useCallback(() => {
    if (!formData.make.trim()) return "Vehicle make is required.";
    if (!formData.model.trim()) return "Vehicle model is required.";
    if (!formData.year.trim()) return "Vehicle year is required.";
    if (!formData.color.trim()) return "Vehicle color is required.";
    if (!formData.licensePlate.trim()) return "License plate is required.";
    if (!formData.seats.trim()) return "Seat capacity is required.";
    if (!formData.fuelType.trim()) return "Fuel type is required.";
    return null;
  }, [formData]);

  const setField = useCallback(
    (field: keyof Omit<Vehicle, "id">, value: string | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setFormError(null);
    },
    [],
  );

  const handleEdit = useCallback((vehicle: Vehicle) => {
    setEditing(vehicle);
    setFormData({
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ?? "",
      color: vehicle.color ?? "",
      licensePlate: vehicle.licensePlate ?? "",
      seats: vehicle.seats ?? "",
      fuelType: vehicle.fuelType ?? "",
      photo: vehicle.photo ?? "",
      isVerified: Boolean(vehicle.isVerified),
    });
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    const nextError = validate();
    if (nextError) {
      setFormError(nextError);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editing && onEditVehicle) {
        await onEditVehicle(editing.id, formData);
      } else if (!editing && onAddVehicle) {
        await onAddVehicle(formData);
      }
      setShowForm(false);
    } catch (err: any) {
      setFormError(err?.message || "Unable to save vehicle.");
    } finally {
      setIsSubmitting(false);
    }
  }, [editing, formData, onAddVehicle, onEditVehicle, validate]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-between px-4 py-4"
        >
          <div className="flex items-center gap-3">
            <Icon name="Bike" size={20} className="text-primary" />
            <Skeleton width={150} height={18} />
          </div>
          <Skeleton width={18} height={18} />
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-4 transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-3">
          <Icon name="Bike" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Vehicles</h3>
            <p className="text-xs text-muted-foreground">
              Approved vehicles are required to publish ride offers.
            </p>
          </div>
          {displayedVehicles.length > 0 ? (
            <Badge variant="secondary">{displayedVehicles.length}</Badge>
          ) : null}
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground"
        />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[3200px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-4 border-t border-border/70 px-4 pb-5 pt-4">
          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {displayedVehicles.length === 0 && !showForm ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <Icon name="CarFront" size={26} className="mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">No vehicles added yet</p>
              <p className="text-xs text-muted-foreground">
                Add your primary vehicle so you can offer rides.
              </p>
            </div>
          ) : null}

          {displayedVehicles.map((vehicle) => (
            <article
              key={String(vehicle.id)}
              className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4"
            >
              <div className="flex gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-16 sm:w-16">
                  {vehicle.photo ? (
                    <AppImage
                      src={vehicle.photo}
                      alt={`${vehicle.make} ${vehicle.model}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon name="CarFront" size={22} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground sm:text-base">
                      {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")}
                    </h4>
                    <Badge variant={vehicle.isVerified ? "secondary" : "outline"}>
                      {vehicle.isVerified ? "Approved" : "Under Review"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {[vehicle.color, vehicle.licensePlate].filter(Boolean).join(" • ")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground sm:text-sm">
                    <span>{vehicle.seats || "-"} seats</span>
                    <span className="capitalize">{vehicle.fuelType || "-"}</span>
                  </div>
                </div>
                <div className="flex items-start gap-1">
                  {onEditVehicle ? (
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(vehicle)}>
                      <Edit className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    title="Vehicle delete will be available after moderation safeguards are added."
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </article>
          ))}

          {showForm ? (
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <h4 className="text-sm font-semibold text-foreground sm:text-base">
                {editing ? "Edit Vehicle" : "Add Vehicle"}
              </h4>
              {formError ? (
                <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-make">Make</Label>
                  <Input
                    id="vehicle-make"
                    value={formData.make}
                    onChange={(e) => setField("make", e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-model">Model</Label>
                  <Input
                    id="vehicle-model"
                    value={formData.model}
                    onChange={(e) => setField("model", e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-year">Year</Label>
                  <Input
                    id="vehicle-year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setField("year", e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-color">Color</Label>
                  <Input
                    id="vehicle-color"
                    value={formData.color}
                    onChange={(e) => setField("color", e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-plate">License Plate</Label>
                  <Input
                    id="vehicle-plate"
                    value={formData.licensePlate}
                    onChange={(e) => setField("licensePlate", e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-seats">Seats</Label>
                  <Select
                    value={formData.seats}
                    onValueChange={(value) => setField("seats", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="vehicle-seats">
                      <SelectValue placeholder="Select seats" />
                    </SelectTrigger>
                    <SelectContent>
                      {seatOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value} seats
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-fuel">Fuel Type</Label>
                  <Select
                    value={formData.fuelType}
                    onValueChange={(value) => setField("fuelType", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="vehicle-fuel">
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      {fuelOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value[0].toUpperCase() + value.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-photo">Photo URL</Label>
                  <Input
                    id="vehicle-photo"
                    type="url"
                    value={formData.photo ?? ""}
                    onChange={(e) => setField("photo", e.target.value)}
                    disabled={isSubmitting}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Icon name="Loader" size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="size-4" />
                      {editing ? "Update Vehicle" : "Add Vehicle"}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowForm(true)}>
              <Plus className="size-4" />
              Add Vehicle
            </Button>
          )}

          {onDeleteVehicle ? (
            <p className="text-xs text-muted-foreground">
              Vehicle delete is intentionally disabled in this release to prevent accidental offer
              disruptions. Support-assisted delete is coming soon.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default VehicleInfoSection;
