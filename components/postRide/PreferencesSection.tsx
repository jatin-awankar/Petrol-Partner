"use client";

import React from "react";
import Icon from "../AppIcon";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";

interface PreferencesSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
  mode?: "offer" | "request";
}

const genderOptions = [
  { value: "any", label: "Any" },
  { value: "male", label: "Male only" },
  { value: "female", label: "Female only" },
];

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  formData,
  updateFormData,
  mode = "offer",
}) => {
  const updatePreference = (field: string, value: unknown) => {
    updateFormData({
      ...formData,
      preferences: {
        ...formData.preferences,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
            <Icon name="ShieldCheck" size={18} className="text-primary" />
            Ride preferences
          </h3>
          <Badge variant="outline">{mode === "offer" ? "Host settings" : "Rider settings"}</Badge>
        </div>

        <div className="space-y-2">
          <Label>Preferred co-rider gender</Label>
          <Select
            value={formData.preferences.gender || "any"}
            onValueChange={(value) => updatePreference("gender", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select preference" />
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
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
        <Label>Notes for other student (optional)</Label>
        <textarea
          value={formData.preferences.notes || ""}
          onChange={(e) => updatePreference("notes", e.target.value)}
          placeholder={
            mode === "offer"
              ? "Pickup landmark, luggage info, or any ride rule..."
              : "Any flexibility or pickup guidance..."
          }
          className="mt-2 w-full h-28 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          maxLength={300}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {(formData.preferences.notes || "").length}/300
        </p>
      </div>
    </div>
  );
};

export default PreferencesSection;
