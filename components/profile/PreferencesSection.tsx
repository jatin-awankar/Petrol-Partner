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
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<Preferences>(preferences || {});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (preferences) setFormData(preferences);
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

  const Skeleton = ({ className }: { className?: string }) => (
    <div className={`animate-pulse bg-muted rounded ${className}`} />
  );

  return (
    <div className="bg-card border border-border rounded-lg mb-6 shadow-soft transition-all hover:shadow-md">
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
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-1/3 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-6 w-1/3 mt-6" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
              <Skeleton className="h-6 w-1/3 mt-6" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
              <Skeleton className="h-6 w-1/3 mt-6" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
              <Skeleton className="h-10 w-32 mt-6" />
            </>
          ) : (
            <>
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
                        <small className="text-muted-foreground">
                          {item.desc}
                        </small>
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
                            [item.key as keyof typeof formData.privacy]:
                              checked,
                          })
                        }
                      />
                      <Label
                        htmlFor={item.id}
                        className="flex flex-col items-start"
                      >
                        <span>{item.label}</span>
                        <small className="text-muted-foreground">
                          {item.desc}
                        </small>
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
                            [item.key as keyof typeof formData.autoAccept]:
                              checked,
                          })
                        }
                      />
                      <Label
                        htmlFor={item.id}
                        className="flex flex-col items-start"
                      >
                        <span>{item.label}</span>
                        <small className="text-muted-foreground">
                          {item.desc}
                        </small>
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
                <span className="flex items-center">
                  <svg
                    className="mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1"
                    />
                  </svg>
                </span>
                {isSaving ? "Saving..." : "Save Preferences"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreferencesSection;
