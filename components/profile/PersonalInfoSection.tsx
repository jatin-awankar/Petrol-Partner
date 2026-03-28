import React, { useCallback, useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
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
import { Edit, Save } from "lucide-react";

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

const EMPTY: User = {
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
  isLoading = false,
  error = null,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<User>(EMPTY);

  useEffect(() => {
    setFormData({
      ...EMPTY,
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      dateOfBirth: user?.dateOfBirth ?? "",
      gender: user?.gender ?? "",
      emergencyContact: user?.emergencyContact ?? "",
      emergencyPhone: user?.emergencyPhone ?? "",
      address: user?.address ?? "",
      email: user?.email ?? "",
    });
  }, [user]);

  const setField = useCallback((key: keyof User, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }, []);

  const validate = useCallback(() => {
    if (!formData.name?.trim()) return "Full name is required.";
    if (!formData.phone?.trim()) return "Phone number is required.";
    return null;
  }, [formData.name, formData.phone]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    const nextError = validate();
    if (nextError) {
      setFormError(nextError);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await onSave(formData);
      setIsEditing(false);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2200);
    } catch (err: any) {
      setFormError(err?.message || "Unable to update profile.");
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSave, validate]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setFormError(null);
    setFormData({
      ...EMPTY,
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      dateOfBirth: user?.dateOfBirth ?? "",
      gender: user?.gender ?? "",
      emergencyContact: user?.emergencyContact ?? "",
      emergencyPhone: user?.emergencyPhone ?? "",
      address: user?.address ?? "",
      email: user?.email ?? "",
    });
  }, [user]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
        <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Icon name="User" size={20} className="text-primary" />
            <Skeleton width={180} height={18} />
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
          <Icon name="User" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Personal Info</h3>
            <p className="text-xs text-muted-foreground">Identity, contact details, and emergency information.</p>
          </div>
        </div>
        <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={20} className="text-muted-foreground" />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[2800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-4 border-t border-border/70 px-4 pb-5 pt-4">
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {formError ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="rounded-lg border border-emerald-300/40 bg-emerald-100/40 p-3 text-sm text-emerald-700">
              Profile updated.
            </p>
          ) : null}

          {!isEditing ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Full name</p>
                  <p className="text-sm font-medium text-foreground">{formData.name || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium text-foreground">{formData.phone || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-foreground">{formData.email || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date of birth</p>
                  <p className="text-sm font-medium text-foreground">
                    {formData.dateOfBirth
                      ? new Date(formData.dateOfBirth).toLocaleDateString()
                      : "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <p className="text-sm font-medium capitalize text-foreground">
                    {formData.gender || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Emergency contact</p>
                  <p className="text-sm font-medium text-foreground">
                    {[formData.emergencyContact, formData.emergencyPhone].filter(Boolean).join(" - ") ||
                      "Not provided"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-sm font-medium text-foreground">{formData.address || "Not provided"}</p>
              </div>
              {onSave ? (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="size-4" />
                  Edit
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name">Full name</Label>
                  <Input
                    id="profile-name"
                    value={formData.name ?? ""}
                    onChange={(e) => setField("name", e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone">Phone</Label>
                  <Input
                    id="profile-phone"
                    value={formData.phone ?? ""}
                    onChange={(e) => setField("phone", e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email">Email (read only)</Label>
                  <Input id="profile-email" value={formData.email ?? ""} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-dob">Date of birth</Label>
                  <Input
                    id="profile-dob"
                    type="date"
                    value={formData.dateOfBirth ?? ""}
                    onChange={(e) => setField("dateOfBirth", e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-gender">Gender</Label>
                  <Select
                    value={formData.gender || ""}
                    onValueChange={(value) => setField("gender", value)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="profile-gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                      <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-address">Address</Label>
                  <Input
                    id="profile-address"
                    value={formData.address ?? ""}
                    onChange={(e) => setField("address", e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-emergency-name">Emergency contact name</Label>
                  <Input
                    id="profile-emergency-name"
                    value={formData.emergencyContact ?? ""}
                    onChange={(e) => setField("emergencyContact", e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-emergency-phone">Emergency contact phone</Label>
                  <Input
                    id="profile-emergency-phone"
                    value={formData.emergencyPhone ?? ""}
                    onChange={(e) => setField("emergencyPhone", e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl border border-border/60 bg-card/95 px-3 py-3 backdrop-blur">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Icon name="Loader" size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="size-4" />
                      Save
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default PersonalInfoSection;
