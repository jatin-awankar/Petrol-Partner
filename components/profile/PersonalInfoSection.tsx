import React, { useState, useEffect } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Edit } from "lucide-react";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";

interface User {
  name?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  address?: string;
}

interface PersonalInfoSectionProps {
  user: User;
  onSave: (formData: User) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

const PersonalInfoSection: React.FC<PersonalInfoSectionProps> = ({
  user,
  onSave,
  isExpanded,
  onToggle,
}) => {
  const [formData, setFormData] = useState<User | null>(null); // start with null to trigger skeleton
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
    { value: "prefer-not-to-say", label: "Prefer not to say" },
  ];

  // Simulate loading delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setFormData({
        name: user?.name ?? "",
        phone: user?.phone ?? "",
        dateOfBirth: user?.dateOfBirth ?? "",
        gender: user?.gender ?? "",
        emergencyContact: user?.emergencyContact ?? "",
        emergencyPhone: user?.emergencyPhone ?? "",
        address: user?.address ?? "",
      });
    }, 800); // skeleton for 0.8s
    return () => clearTimeout(timer);
  }, [user]);

  const handleInputChange = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      if (formData) {
        onSave(formData);
      }
      setIsEditing(false);
      setIsSaving(false);
    }, 1000);
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name,
      phone: user?.phone,
      dateOfBirth: user?.dateOfBirth,
      gender: user?.gender,
      emergencyContact: user?.emergencyContact,
      emergencyPhone: user?.emergencyPhone,
      address: user?.address,
    });
    setIsEditing(false);
  };

  // Render skeleton when formData is null
  if (!formData) {
    return (
      <div className="bg-card border border-border rounded-lg mb-4">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="User" size={20} className="text-primary" />
            <Skeleton className="w-48 h-5 rounded" />
          </div>
          <Skeleton className="w-5 h-5 rounded" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
            <Skeleton className="w-full h-5 rounded" />
            <Skeleton className="w-full h-5 rounded" />
            <Skeleton className="w-full h-5 rounded" />
            <Skeleton className="w-full h-5 rounded" />
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
          <Icon name="User" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Personal Information</h3>
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
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-6">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Full Name
                  </label>
                  <p className="text-muted-foreground">{formData?.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Phone Number
                  </label>
                  <p className="text-muted-foreground">{formData?.phone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Date of Birth
                  </label>
                  <p className="text-muted-foreground">
                    {formData?.dateOfBirth}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Gender
                  </label>
                  <p className="text-muted-foreground capitalize">
                    {formData?.gender}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <h4 className="font-medium text-foreground">
                  Emergency Contact
                </h4>
                <p className="text-sm text-muted-foreground">
                  {formData?.emergencyContact} — {formData?.emergencyPhone}
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <label className="text-sm font-medium text-foreground">
                  Address
                </label>
                <p className="text-muted-foreground">{formData?.address}</p>
              </div>

              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="mt-4 text-foreground/60"
              >
                <Edit />
                Edit Information
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Label>Full Name</Label>
                <Input
                  type="text"
                  value={formData?.name}
                  onChange={(e) => handleInputChange("name", e?.target?.value)}
                  required
                />

                <Label>Phone Number</Label>
                <Input
                  type="tel"
                  value={formData?.phone}
                  onChange={(e) => handleInputChange("phone", e?.target?.value)}
                  required
                />

                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={formData?.dateOfBirth}
                  onChange={(e) =>
                    handleInputChange("dateOfBirth", e?.target?.value)
                  }
                  required
                />

                <Label>Gender Preference</Label>
                <Select
                  value={formData?.gender || ""}
                  onValueChange={(value) => handleInputChange("gender", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {genderOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <h4 className="font-medium text-foreground">
                  Emergency Contact
                </h4>
                <Label>Contact Name</Label>
                <Input
                  type="text"
                  value={formData?.emergencyContact}
                  onChange={(e) =>
                    handleInputChange("emergencyContact", e?.target?.value)
                  }
                  required
                />

                <Label>Contact Phone</Label>
                <Input
                  type="tel"
                  value={formData?.emergencyPhone}
                  onChange={(e) =>
                    handleInputChange("emergencyPhone", e?.target?.value)
                  }
                  required
                />
              </div>

              <Label>Address</Label>
              <Input
                type="text"
                value={formData?.address}
                onChange={(e) => handleInputChange("address", e?.target?.value)}
                className="border-t border-border pt-4"
              />

              <div className="flex space-x-3 pt-4">
                <Button
                  variant="default"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving && (
                    <span className="animate-spin mr-2 inline-block align-middle">
                      {/* You can replace this with a spinner icon if you have one */}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        ></path>
                      </svg>
                    </span>
                  )}
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoSection;
