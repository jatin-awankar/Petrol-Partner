"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
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

export interface Preferences {
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

export interface PreferencesSectionProps {
  preferences?: Preferences | null;
  onSave?: (data: Preferences) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const DEFAULT_PREFERENCES: Preferences = {
  musicPreference: "",
  smokingPolicy: "",
  chattiness: "",
  notifications: {
    rideMatches: false,
    messages: false,
    payments: false,
    promotions: false,
  },
  privacy: {
    showProfile: false,
    shareRideHistory: false,
    shareLocation: false,
  },
  autoAccept: {
    highRatedUsers: false,
    sameCollege: false,
  },
};

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  preferences = null,
  onSave,
  isExpanded,
  onToggle,
  isLoading: externalLoading = false,
  error: externalError = null,
}) => {
  const [formData, setFormData] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [isInternalLoading, setIsInternalLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isLoading = externalLoading || isInternalLoading;

  // Configuration arrays
  const musicOptions = useMemo(
    () => [
      { value: "any", label: "Any music is fine" },
      { value: "pop", label: "Pop" },
      { value: "rock", label: "Rock" },
      { value: "classical", label: "Classical" },
      { value: "jazz", label: "Jazz" },
      { value: "no-music", label: "Prefer no music" },
    ],
    []
  );

  const smokingOptions = useMemo(
    () => [
      { value: "no-smoking", label: "No smoking allowed" },
      { value: "smoking-ok", label: "Smoking is okay" },
      { value: "no-preference", label: "No preference" },
    ],
    []
  );

  const chattinessOptions = useMemo(
    () => [
      { value: "chatty", label: "Love to chat" },
      { value: "moderate", label: "Moderate conversation" },
      { value: "quiet", label: "Prefer quiet rides" },
    ],
    []
  );

  const notificationItems = useMemo(
    () => [
      {
        id: "rideMatches",
        label: "Ride match notifications",
        desc: "Get notified when someone matches your ride",
        key: "rideMatches" as const,
      },
      {
        id: "messages",
        label: "Message notifications",
        desc: "Get notified for new messages",
        key: "messages" as const,
      },
      {
        id: "payments",
        label: "Payment notifications",
        desc: "Get notified for payment updates",
        key: "payments" as const,
      },
      {
        id: "promotions",
        label: "Promotional notifications",
        desc: "Receive updates about new features and offers",
        key: "promotions" as const,
      },
    ],
    []
  );

  const privacyItems = useMemo(
    () => [
      {
        id: "showProfile",
        label: "Show my profile to other students",
        desc: "Allow other verified students to see your profile",
        key: "showProfile" as const,
      },
      {
        id: "shareRideHistory",
        label: "Share ride history for better matches",
        desc: "Help us suggest better ride matches based on your history",
        key: "shareRideHistory" as const,
      },
      {
        id: "shareLocation",
        label: "Allow location sharing during rides",
        desc: "Share your location with emergency contacts during active rides",
        key: "shareLocation" as const,
      },
    ],
    []
  );

  const autoAcceptItems = useMemo(
    () => [
      {
        id: "highRatedUsers",
        label: "Auto-accept rides from highly rated users",
        desc: "Automatically accept ride requests from users with 4.5+ rating",
        key: "highRatedUsers" as const,
      },
      {
        id: "sameCollege",
        label: "Auto-accept rides from same college",
        desc: "Automatically accept requests from students in your college",
        key: "sameCollege" as const,
      },
    ],
    []
  );

  // Initialize from props
  useEffect(() => {
    if (preferences !== null) {
      const timer = setTimeout(() => {
        setFormData({
          ...DEFAULT_PREFERENCES,
          ...preferences,
          notifications: {
            ...DEFAULT_PREFERENCES.notifications,
            ...(preferences?.notifications ?? {}),
          },
          privacy: {
            ...DEFAULT_PREFERENCES.privacy,
            ...(preferences?.privacy ?? {}),
          },
          autoAccept: {
            ...DEFAULT_PREFERENCES.autoAccept,
            ...(preferences?.autoAccept ?? {}),
          },
        });
        setIsInternalLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIsInternalLoading(false);
    }
  }, [preferences]);

  const handleInputChange = useCallback(
    <K extends keyof Preferences>(field: K, value: Preferences[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await onSave(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save preferences:", err);
      // Error is handled by parent component via error prop
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSave]);

  // Render skeleton when loading
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
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
    <div className="bg-card border border-border rounded-lg shadow-card">
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
          {saveSuccess && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
              <p className="text-sm text-success">Preferences saved successfully!</p>
            </div>
          )}

          {externalError && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{externalError}</p>
            </div>
          )}

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
              {notificationItems.map((item) => (
                <div key={item.id} className="flex items-start space-x-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={item.id}
                    checked={
                      formData.notifications?.[item.key] ?? false
                    }
                    onCheckedChange={(checked) =>
                      handleInputChange("notifications", {
                        ...formData.notifications,
                        [item.key]: checked === true,
                      })
                    }
                    className="mt-1"
                  />
                  <Label
                    htmlFor={item.id}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="block font-medium text-foreground mb-1">
                      {item.label}
                    </span>
                    <small className="text-muted-foreground text-sm">
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
              {privacyItems.map((item) => (
                <div key={item.id} className="flex items-start space-x-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={item.id}
                    checked={formData.privacy?.[item.key] ?? false}
                    onCheckedChange={(checked) =>
                      handleInputChange("privacy", {
                        ...formData.privacy,
                        [item.key]: checked === true,
                      })
                    }
                    className="mt-1"
                  />
                  <Label
                    htmlFor={item.id}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="block font-medium text-foreground mb-1">
                      {item.label}
                    </span>
                    <small className="text-muted-foreground text-sm">
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
              {autoAcceptItems.map((item) => (
                <div key={item.id} className="flex items-start space-x-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={item.id}
                    checked={formData.autoAccept?.[item.key] ?? false}
                    onCheckedChange={(checked) =>
                      handleInputChange("autoAccept", {
                        ...formData.autoAccept,
                        [item.key]: checked === true,
                      })
                    }
                    className="mt-1"
                  />
                  <Label
                    htmlFor={item.id}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="block font-medium text-foreground mb-1">
                      {item.label}
                    </span>
                    <small className="text-muted-foreground text-sm">
                      {item.desc}
                    </small>
                  </Label>
                </div>
              ))}
            </div>
          </section>

          {/* Save Button */}
          {onSave && (
            <Button
              variant="default"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="mt-6 w-full sm:w-auto flex items-center"
            >
              {isSaving ? (
                <>
                  <Icon name="Loader" className="animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreferencesSection;
