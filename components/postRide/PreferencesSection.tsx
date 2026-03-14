"use client";

import React, { useEffect, useState } from "react";
import Icon from "../AppIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import Skeleton from "react-loading-skeleton";

interface PreferencesSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: any;
}

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);

  const handlePreferenceChange = (field: string, value: any) => {
    updateFormData({
      ...formData,
      preferences: {
        ...formData?.preferences,
        [field]: value,
      },
    });
  };

  const handleRuleToggle = (rule: string) => {
    const rules = formData?.preferences?.rules?.includes(rule)
      ? formData?.preferences?.rules?.filter((r: string) => r !== rule)
      : [...(formData?.preferences?.rules || []), rule];
    handlePreferenceChange("rules", rules);
  };

  const genderOptions = [
    { value: "any", label: "Any Gender" },
    { value: "male", label: "Male Only" },
    { value: "female", label: "Female Only" },
  ];

  const conversationOptions = [
    { value: "any", label: "Any" },
    { value: "quiet", label: "Quiet Ride" },
    { value: "chatty", label: "Chatty Ride" },
  ];

  const musicOptions = [
    { value: "any", label: "Any" },
    { value: "low", label: "Low Volume" },
    { value: "off", label: "No Music" },
  ];

  const rideRules = [
    { id: "no_smoking", label: "No Smoking", icon: "Ban" },
    { id: "no_alcohol", label: "No Alcohol", icon: "WineOff" },
    { id: "quiet", label: "Quiet Ride", icon: "VolumeX" },
    { id: "verified_only", label: "Verified Students Only", icon: "Shield" },
    { id: "luggage_ok", label: "Bags Welcome", icon: "Luggage" },
    { id: "on_time", label: "Be On Time", icon: "Clock" },
  ];

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 space-y-6 shadow-card animate-pulse">
        <Skeleton className="h-6 w-1/3" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6 shadow-card">
      <h3 className="text-lg font-semibold text-foreground flex items-center mb-4">
        <Icon name="Settings" size={20} className="mr-2 text-primary" />
        Ride Preferences
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Gender Preference</Label>
            <Select
              value={formData?.preferences?.gender || ""}
              onValueChange={(value) => handlePreferenceChange("gender", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select gender" />
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

          <div className="space-y-2">
            <Label>Conversation Style</Label>
            <Select
              value={formData?.preferences?.conversation || ""}
              onValueChange={(value) =>
                handlePreferenceChange("conversation", value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select conversation" />
              </SelectTrigger>
              <SelectContent>
                {conversationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Age Range (Optional)</Label>
            <div className="flex items-center space-x-3">
              <Input
                type="number"
                min={18}
                max={30}
                value={formData?.preferences?.ageRange?.[0] || ""}
                onChange={(e) => {
                  const min = parseInt(e.target.value);
                  const max = formData?.preferences?.ageRange?.[1] || min;
                  handlePreferenceChange("ageRange", [Math.min(min, max), max]);
                }}
                className="flex-1"
              />
              <span className="text-sm text-foreground font-medium">-</span>
              <Input
                type="number"
                min={18}
                max={30}
                value={formData?.preferences?.ageRange?.[1] || ""}
                onChange={(e) => {
                  const max = parseInt(e.target.value);
                  const min = formData?.preferences?.ageRange?.[0] || max;
                  handlePreferenceChange("ageRange", [min, Math.max(min, max)]);
                }}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Music Preference</Label>
            <Select
              value={formData?.preferences?.music || ""}
              onValueChange={(value) => handlePreferenceChange("music", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select music" />
              </SelectTrigger>
              <SelectContent>
                {musicOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <Label className="block text-sm font-medium text-foreground mb-3">
          Ride Rules and Requirements
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rideRules.map((rule) => (
            <Button
              key={rule.id}
              variant={
                formData?.preferences?.rules?.includes(rule.id)
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => handleRuleToggle(rule.id)}
              className="justify-start"
            >
              <Icon name={rule.icon} size={20} className="mr-2" />
              {rule.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="block text-sm font-medium text-foreground mb-3">
          Additional Notes (Optional)
        </Label>
        <textarea
          value={formData?.preferences?.notes || ""}
          onChange={(e) => handlePreferenceChange("notes", e.target.value)}
          placeholder="Any specific instructions or preferences for riders"
          className="w-full px-3 py-2 border border-border rounded-lg bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none h-24"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {formData?.preferences?.notes?.length || 0}/200 characters
        </p>
      </div>

      <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-start space-x-3">
        <Icon name="Shield" size={20} className="text-warning mt-0.5" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p>- Meet riders in well-lit, public areas</p>
          <p>- Confirm identity before starting the ride</p>
          <p>- Share your trip details with a trusted contact</p>
          <p>- Trust your instincts and cancel if needed</p>
        </div>
      </div>
    </div>
  );
};

export default PreferencesSection;
