import React, { useState, useEffect, useCallback } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Edit, Save } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export interface User {
  name?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  address?: string;
  email?: string;
  [key: string]: unknown;
}

export interface PersonalInfoSectionProps {
  user?: User | null;
  onSave?: (formData: User) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const DEFAULT_USER_FORM: User = {
  name: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  emergencyContact: "",
  emergencyPhone: "",
  address: "",
  email: "",
};

const PersonalInfoSection: React.FC<PersonalInfoSectionProps> = ({
  user = null,
  onSave,
  isExpanded,
  onToggle,
  isLoading: externalLoading = false,
  error: externalError = null,
}) => {
  const [formData, setFormData] = useState<User>(DEFAULT_USER_FORM);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isLoading = externalLoading;

  useEffect(() => {
    if (user) {
      setFormData({
        ...DEFAULT_USER_FORM,
        name: user?.name ?? "",
        phone: user?.phone ?? "",
        dateOfBirth: user?.dateOfBirth ?? "",
        gender: user?.gender ?? "",
        emergencyContact: user?.emergencyContact ?? "",
        emergencyPhone: user?.emergencyPhone ?? "",
        address: user?.address ?? "",
        email: user?.email ?? "",
      });
    } else {
      setFormData(DEFAULT_USER_FORM);
    }
  }, [user]);

  const handleInputChange = useCallback(
    (field: keyof User, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setFormError(null);
    },
    []
  );

  const validateForm = useCallback((): boolean => {
    if (!formData.name?.trim()) {
      setFormError("Name is required");
      return false;
    }
    if (!formData.phone?.trim()) {
      setFormError("Phone number is required");
      return false;
    }
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    if (!phoneRegex.test(formData.phone.trim())) {
      setFormError("Please enter a valid phone number");
      return false;
    }
    return true;
  }, [formData]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setFormError(null);

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      await onSave({ name: formData.name, phone: formData.phone });
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save profile. Please try again."
      );
      console.error("Save personal info error:", err);
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSave, validateForm]);

  const handleCancel = useCallback(() => {
    if (user) {
      setFormData({
        ...DEFAULT_USER_FORM,
        name: user?.name ?? "",
        phone: user?.phone ?? "",
        dateOfBirth: user?.dateOfBirth ?? "",
        gender: user?.gender ?? "",
        emergencyContact: user?.emergencyContact ?? "",
        emergencyPhone: user?.emergencyPhone ?? "",
        address: user?.address ?? "",
        email: user?.email ?? "",
      });
    } else {
      setFormData(DEFAULT_USER_FORM);
    }
    setIsEditing(false);
    setFormError(null);
  }, [user]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="User" size={20} className="text-primary" />
            <Skeleton width={192} height={20} className="rounded" />
          </div>
          <Skeleton width={20} height={20} className="rounded" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
            <Skeleton width="100%" height={80} className="rounded" />
            <Skeleton width="100%" height={80} className="rounded" />
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
          <Icon name="User" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Personal Information</h3>
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
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-6">
          {saveSuccess && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
              <p className="text-sm text-success">Profile saved successfully!</p>
            </div>
          )}

          {(externalError || formError) && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{externalError || formError}</p>
            </div>
          )}

          {!isEditing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Full Name
                  </label>
                  <p className="text-muted-foreground mt-1">
                    {formData.name || "Not provided"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Phone Number
                  </label>
                  <p className="text-muted-foreground mt-1">
                    {formData.phone || "Not provided"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <p className="text-muted-foreground mt-1">
                    {formData.email || "Not provided"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Date of Birth
                  </label>
                  <p className="text-muted-foreground mt-1">
                    {formData.dateOfBirth
                      ? new Date(formData.dateOfBirth).toLocaleDateString()
                      : "Not provided"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Gender
                  </label>
                  <p className="text-muted-foreground mt-1 capitalize">
                    {formData.gender || "Not provided"}
                  </p>
                </div>
              </div>

              {(formData.emergencyContact || formData.emergencyPhone) && (
                <div className="border-t border-border pt-4 space-y-2">
                  <h4 className="font-medium text-foreground">
                    Emergency Contact
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {formData.emergencyContact || "Not provided"}
                    {formData.emergencyContact && formData.emergencyPhone && " - "}
                    {formData.emergencyPhone || ""}
                  </p>
                </div>
              )}

              {formData.address && (
                <div className="border-t border-border pt-4">
                  <label className="text-sm font-medium text-foreground">
                    Address
                  </label>
                  <p className="text-muted-foreground mt-1">{formData.address}</p>
                </div>
              )}

              {onSave && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="mt-4"
                >
                  <Edit />
                  Edit Information
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name ?? ""}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    required
                    disabled={isSaving}
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone ?? ""}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    required
                    disabled={isSaving}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Email, date of birth, gender, and emergency contacts are read-only for now.
              </div>

              <div className="flex space-x-3 pt-4">
                {onSave && (
                  <Button
                    variant="default"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Icon name="Loader" className="animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save />
                        Save Changes
                      </>
                    )}
                  </Button>
                )}
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
