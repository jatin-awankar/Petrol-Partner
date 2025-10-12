"use client";
import React, { useState, useEffect } from "react";
import Icon from "../AppIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import Skeleton from "react-loading-skeleton";

interface Preferences {
  musicPreference?: string;
  smokingPolicy?: string;
  chattiness?: string;
  notifications?: {
    rideMatches?: boolean;
    messages?: boolean;
    payments?: boolean;
    promotions?: boolean;
  };
  privacy?: {
    showProfile?: boolean;
    shareRideHistory?: boolean;
    shareLocation?: boolean;
  };
  autoAccept?: {
    highRatedUsers?: boolean;
    sameCollege?: boolean;
  };
}

interface PreferencesSectionProps {
  preferences?: Preferences;
  onSave: (data: Preferences) => void;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
}

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  preferences,
  onSave,
  isExpanded,
  onToggle,
  isLoading = true,
}) => {
  const [formData, setFormData] = useState<Preferences>(preferences || {});
  const [isSaving, setIsSaving] = useState(false);
  const [isloading, setIsLoading] = useState(isLoading);

  const musicOptions = [
    { value: "any", label: "Any music is fine" },
    { value: "pop", label: "Pop" },
    { value: "rock", label: "Rock" },
    { value: "classical", label: "Classical" },
    { value: "jazz", label: "Jazz" },
    { value: "no-music", label: "Prefer no music" },
  ];

  const smokingOptions = [
    { value: "no-smoking", label: "No smoking allowed" },
    { value: "smoking-ok", label: "Smoking is okay" },
    { value: "no-preference", label: "No preference" },
  ];

  const chattinessOptions = [
    { value: "chatty", label: "Love to chat" },
    { value: "moderate", label: "Moderate conversation" },
    { value: "quiet", label: "Prefer quiet rides" },
  ];

  // Simulate loading delay
  useEffect(() => {
    const timer = setTimeout(() => {
      if (preferences) {
        setFormData(preferences);
      }
      setIsLoading(false);
    }, 800); // skeleton for 0.8s
    return () => clearTimeout(timer);
  }, [preferences]);

  const handleInputChange = <K extends keyof Preferences>(
    field: K,
    value: Preferences[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setTimeout(() => {
      onSave(formData);
      setIsSaving(false);
    }, 1000);
  };

  // Render skeleton when formData is null
  if (isloading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-md mb-4 animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="Settings" size={20} className="text-primary" />
            <Skeleton
              width={160}
              height={20}
              className="rounded animate-bounce"
            />
          </div>
          <Skeleton width={20} height={20} className="rounded animate-bounce" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-8">
            <Skeleton width="33.33%" height={24} className="mb-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton width="100" height={40} className="animate-pulse" />
              <Skeleton width="100" height={40} className="animate-pulse" />
              <Skeleton width="100" height={40} className="animate-pulse" />
            </div>
            <Skeleton width="33.33%" height={24} className="mt-6" />
            <div className="space-y-3">
              <Skeleton width="100%" height={24} className="animate-pulse" />
              <Skeleton width="100%" height={24} className="animate-pulse" />
              <Skeleton width="100%" height={24} className="animate-pulse" />
              <Skeleton width="100%" height={24} className="animate-pulse" />
            </div>
            <Skeleton width="33.33%" height={24} className="mt-6" />
            <div className="space-y-3">
              <Skeleton width="100%" height={24} className="animate-pulse" />
              <Skeleton width="100%" height={24} className="animate-pulse" />
              <Skeleton width="100%" height={24} className="animate-pulse" />
            </div>
            <Skeleton width="33.33%" height={24} className="mt-6" />
            <div className="space-y-3">
              <Skeleton width="100%" height={24} className="animate-pulse" />
              <Skeleton width="100%" height={24} className="animate-pulse" />
            </div>
            <Skeleton width={128} height={40} className="mt-6 animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg mb-6 shadow-md">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Icon name="Settings" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Ride Preferences</h3>
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground transition-transform duration-200"
        />
      </button>

      {/* Content */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-6 border-t border-border pt-4 space-y-8">
          {/* Ride Preferences */}
          <section>
            <h4 className="font-medium text-foreground mb-4">
              Ride Preferences
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Music Preference
                </label>
                <Select
                  value={formData.musicPreference || ""}
                  onValueChange={(value) =>
                    handleInputChange("musicPreference", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select music preference" />
                  </SelectTrigger>
                  <SelectContent>
                    {musicOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Smoking Policy
                </label>
                <Select
                  value={formData.smokingPolicy || ""}
                  onValueChange={(value) =>
                    handleInputChange("smokingPolicy", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select smoking policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {smokingOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Conversation Level
                </label>
                <Select
                  value={formData.chattiness || ""}
                  onValueChange={(value) =>
                    handleInputChange("chattiness", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select conversation level" />
                  </SelectTrigger>
                  <SelectContent>
                    {chattinessOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Notification Settings */}
          <section className="border-t border-border pt-6">
            <h4 className="font-medium text-foreground mb-4">
              Notification Settings
            </h4>
            <div className="space-y-3">
              {[
                {
                  id: "rideMatches",
                  label: "Ride match notifications",
                  desc: "Get notified when someone matches your ride",
                  key: "rideMatches",
                },
                {
                  id: "messages",
                  label: "Message notifications",
                  desc: "Get notified for new messages",
                  key: "messages",
                },
                {
                  id: "payments",
                  label: "Payment notifications",
                  desc: "Get notified for payment updates",
                  key: "payments",
                },
                {
                  id: "promotions",
                  label: "Promotional notifications",
                  desc: "Receive updates about new features and offers",
                  key: "promotions",
                },
              ].map((item) => (
                <div key={item.id} className="flex space-x-3">
                  <Checkbox
                    id={item.id}
                    checked={
                      formData.notifications?.[
                        item.key as keyof typeof formData.notifications
                      ] || false
                    }
                    onCheckedChange={(checked) =>
                      handleInputChange("notifications", {
                        ...formData.notifications,
                        [item.key as keyof typeof formData.notifications]:
                          checked,
                      })
                    }
                  />
                  <Label
                    htmlFor={item.id}
                    className="flex flex-col items-start"
                  >
                    <span>{item.label}</span>
                    <small className="text-muted-foreground">{item.desc}</small>
                  </Label>
                </div>
              ))}
            </div>
          </section>

          {/* Privacy Settings */}
          <section className="border-t border-border pt-6">
            <h4 className="font-medium text-foreground mb-4">
              Privacy Settings
            </h4>
            <div className="space-y-3">
              {[
                {
                  id: "showProfile",
                  label: "Show my profile to other students",
                  desc: "Allow other verified students to see your profile",
                  key: "showProfile",
                },
                {
                  id: "shareRideHistory",
                  label: "Share ride history for better matches",
                  desc: "Help us suggest better ride matches based on your history",
                  key: "shareRideHistory",
                },
                {
                  id: "shareLocation",
                  label: "Allow location sharing during rides",
                  desc: "Share your location with emergency contacts during active rides",
                  key: "shareLocation",
                },
              ].map((item) => (
                <div key={item.id} className="flex space-x-3">
                  <Checkbox
                    id={item.id}
                    checked={
                      formData.privacy?.[
                        item.key as keyof typeof formData.privacy
                      ] || false
                    }
                    onCheckedChange={(checked) =>
                      handleInputChange("privacy", {
                        ...formData.privacy,
                        [item.key as keyof typeof formData.privacy]: checked,
                      })
                    }
                  />
                  <Label
                    htmlFor={item.id}
                    className="flex flex-col items-start"
                  >
                    <span>{item.label}</span>
                    <small className="text-muted-foreground">{item.desc}</small>
                  </Label>
                </div>
              ))}
            </div>
          </section>

          {/* Auto-Accept Settings */}
          <section className="border-t border-border pt-6">
            <h4 className="font-medium text-foreground mb-4">
              Auto-Accept Settings
            </h4>
            <div className="space-y-3">
              {[
                {
                  id: "highRatedUsers",
                  label: "Auto-accept rides from highly rated users",
                  desc: "Automatically accept ride requests from users with 4.5+ rating",
                  key: "highRatedUsers",
                },
                {
                  id: "sameCollege",
                  label: "Auto-accept rides from same college",
                  desc: "Automatically accept requests from students in your college",
                  key: "sameCollege",
                },
              ].map((item) => (
                <div key={item.id} className="flex space-x-3">
                  <Checkbox
                    id={item.id}
                    checked={
                      formData.autoAccept?.[
                        item.key as keyof typeof formData.autoAccept
                      ] || false
                    }
                    onCheckedChange={(checked) =>
                      handleInputChange("autoAccept", {
                        ...formData.autoAccept,
                        [item.key as keyof typeof formData.autoAccept]: checked,
                      })
                    }
                  />
                  <Label
                    htmlFor={item.id}
                    className="flex flex-col items-start"
                  >
                    <span>{item.label}</span>
                    <small className="text-muted-foreground">{item.desc}</small>
                  </Label>
                </div>
              ))}
            </div>
          </section>

          {/* Save Button */}
          <Button
            variant="default"
            onClick={handleSave}
            disabled={isSaving}
            className="mt-6 w-full sm:w-auto flex items-center"
          >
            {isSaving && (
              <svg
                className="animate-spin mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
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
            )}
            <span className="flex items-center"></span>
            {isSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesSection;
