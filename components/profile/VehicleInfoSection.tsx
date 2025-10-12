import React, { useState, useEffect } from "react";
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

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  seats: string;
  fuelType: string;
  photo: string;
  isVerified: boolean;
};

type VehicleInfoSectionProps = {
  vehicles: Vehicle[];
  onAddVehicle: (vehicle: Omit<Vehicle, "id">) => void;
  onEditVehicle: (id: string, vehicle: Omit<Vehicle, "id">) => void;
  onDeleteVehicle: (id: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
};

const VehicleInfoSection: React.FC<VehicleInfoSectionProps> = ({
  vehicles,
  onAddVehicle,
  onEditVehicle,
  onDeleteVehicle,
  isExpanded,
  onToggle,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<Omit<Vehicle, "id"> | null>(null); // null triggers skeleton

  const fuelTypeOptions = [
    { value: "petrol", label: "Petrol" },
    { value: "diesel", label: "Diesel" },
    { value: "cng", label: "CNG" },
    { value: "electric", label: "Electric" },
    { value: "hybrid", label: "Hybrid" },
  ];

  const seatOptions = [
    { value: "2", label: "2 Seats" },
    { value: "4", label: "4 Seats" },
    { value: "5", label: "5 Seats" },
    { value: "7", label: "7 Seats" },
    { value: "8", label: "8+ Seats" },
  ];

  // Simulate loading delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setFormData({
        make: "",
        model: "",
        year: "",
        color: "",
        licensePlate: "",
        seats: "",
        fuelType: "",
        photo: "",
        isVerified: false,
      });
    }, 800); // Skeleton for 0.8s
    return () => clearTimeout(timer);
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = () => {
    if (!formData) return;
    if (editingVehicle) {
      onEditVehicle(editingVehicle.id, formData);
      setEditingVehicle(null);
    } else {
      onAddVehicle(formData);
      setShowAddForm(false);
    }
    resetForm();
  };

  const handleEdit = (vehicle: Vehicle) => {
    setFormData({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      licensePlate: vehicle.licensePlate,
      seats: vehicle.seats,
      fuelType: vehicle.fuelType,
      photo: vehicle.photo,
      isVerified: vehicle.isVerified,
    });
    setEditingVehicle(vehicle);
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      make: "",
      model: "",
      year: "",
      color: "",
      licensePlate: "",
      seats: "",
      fuelType: "",
      photo: "",
      isVerified: false,
    });
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingVehicle(null);
    resetForm();
  };

  // Skeleton loader for vehicle list
  if (!formData) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-md mb-4 animate-pulse">
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
    <div className="bg-card border border-border rounded-lg mb-4 shadow-md">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Icon name="Bike" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Vehicle Information</h3>
          {vehicles?.length > 0 && (
            <span className="bg-yellow-500/10 text-yellow-600 text-xs px-2 py-1 rounded-full">
              {vehicles?.length} vehicle{vehicles?.length > 1 ? "s" : ""}
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
          {/* Vehicle List */}
          {vehicles?.length > 0 && (
            <div className="space-y-4 mb-6">
              {vehicles?.map((vehicle) => (
                <div
                  key={vehicle?.id}
                  className="border border-border rounded-lg p-4"
                >
                  <div className="flex items-start space-x-4">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden shrink-0">
                      <AppImage
                        src={vehicle?.photo}
                        alt={`${vehicle?.make} ${vehicle?.model}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-foreground">
                            {vehicle?.make} {vehicle?.model} ({vehicle?.year})
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {vehicle?.color} • {vehicle?.licensePlate}
                          </p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center space-x-1">
                              <Icon
                                name="Users"
                                size={14}
                                className="text-blue-400"
                              />
                              <span>{vehicle?.seats} seats</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Icon
                                name="Fuel"
                                size={14}
                                className="text-purple-500"
                              />
                              <span className="capitalize">
                                {vehicle?.fuelType}
                              </span>
                            </span>
                            {vehicle?.isVerified && (
                              <span className="flex items-center space-x-1 text-success">
                                <Icon name="CheckCircle" size={14} />
                                <span>Verified</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(vehicle)}
                            className="!hover:bg-slate-400/10"
                          >
                            <Edit className="text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteVehicle(vehicle?.id)}
                            className="text-error hover:text-error"
                          >
                            <Trash2 className="text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Vehicle Form */}
          {showAddForm ? (
            <div className="border border-border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-4">
                {editingVehicle ? "Edit Vehicle" : "Add New Vehicle"}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Label>Make</Label>
                <Input
                  type="text"
                  placeholder="e.g., Honda"
                  value={formData?.make}
                  onChange={(e) => handleInputChange("make", e?.target?.value)}
                  required
                />
                <Label>Model</Label>
                <Input
                  type="text"
                  placeholder="e.g., Civic"
                  value={formData?.model}
                  onChange={(e) => handleInputChange("model", e?.target?.value)}
                  required
                />
                <Label>Year</Label>
                <Input
                  type="number"
                  placeholder="e.g., 2020"
                  value={formData?.year}
                  onChange={(e) => handleInputChange("year", e?.target?.value)}
                  required
                />
                <Label>Color</Label>
                <Input
                  type="text"
                  placeholder="e.g., White"
                  value={formData?.color}
                  onChange={(e) => handleInputChange("color", e?.target?.value)}
                  required
                />
                <Label>License Plate</Label>
                <Input
                  type="text"
                  placeholder="e.g., MH12AB1234"
                  value={formData?.licensePlate}
                  onChange={(e) =>
                    handleInputChange("licensePlate", e?.target?.value)
                  }
                  required
                />
                <Label>Max Seats</Label>
                <Select
                  value={formData?.seats || ""}
                  onValueChange={(value) => handleInputChange("seats", value)}
                  required
                >
                  <SelectTrigger>
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
                <Label>Fuel Type</Label>
                <Select
                  value={formData?.fuelType || ""}
                  onValueChange={(value) =>
                    handleInputChange("fuelType", value)
                  }
                  required
                >
                  <SelectTrigger>
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
                <Label>Vehicle Photo URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com/car-photo.jpg"
                  value={formData?.photo}
                  onChange={(e) => handleInputChange("photo", e?.target?.value)}
                />
              </div>

              <div className="flex space-x-3 mt-6">
                <Button variant="default" onClick={handleSubmit}>
                  <Save />
                  {editingVehicle ? "Update Vehicle" : "Add Vehicle"}
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="w-full"
            >
              <Plus />
              Add New Vehicle
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleInfoSection;
