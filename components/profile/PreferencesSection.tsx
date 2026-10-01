"use client";

import React, { useCallback, useEffect, useState } from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ProfileSectionSkeleton } from "./ProfileSkeletons";

export interface Preferences {
  musicPreference?: string;
  smokingPolicy?: string;
  chattiness?: string;
  notifications?: Record<string, boolean>;
  privacy?: Record<string, boolean>;
  autoAccept?: Record<string, boolean>;
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
  musicPreference: "any",
  smokingPolicy: "no-smoking",
  chattiness: "moderate",
  notifications: {
    rideMatches: true,
    messages: true,
    payments: true,
    promotions: false,
  },
  privacy: {
    showProfile: true,
    shareRideHistory: true,
    shareLocation: true,
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
  isLoading = false,
  error = null,
}) => {
  const [form, setForm] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setForm({
      ...DEFAULT_PREFERENCES,
      ...(preferences ?? {}),
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
  }, [preferences]);

  const setTopLevel = useCallback((key: keyof Preferences, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(form);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2200);
    } finally {
      setIsSaving(false);
    }
  }, [form, onSave]);

  if (isLoading) {
    return <ProfileSectionSkeleton icon={<Icon name="Settings" size={20} className="text-primary" />} titleWidthClass="w-40" />;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-4 transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-3">
          <Icon name="Settings" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Preferences</h3>
            <p className="text-xs text-muted-foreground">
              Save your music, smoking, and conversation preferences for future routes.
            </p>
          </div>
        </div>
        <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={20} className="text-muted-foreground" />
      </button>

      <div
        hidden={!isExpanded}
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[2600px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-5 border-t border-border/70 px-4 pb-5 pt-4">
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="rounded-lg border border-emerald-300/40 bg-emerald-100/40 p-3 text-sm text-emerald-700">
              Preferences updated.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Music</Label>
              <Select
                value={form.musicPreference ?? "any"}
                onValueChange={(value) => setTopLevel("musicPreference", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Music preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="pop">Pop</SelectItem>
                  <SelectItem value="rock">Rock</SelectItem>
                  <SelectItem value="classical">Classical</SelectItem>
                  <SelectItem value="jazz">Jazz</SelectItem>
                  <SelectItem value="no-music">No music</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Smoking</Label>
              <Select
                value={form.smokingPolicy ?? "no-smoking"}
                onValueChange={(value) => setTopLevel("smokingPolicy", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Smoking policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-smoking">No smoking</SelectItem>
                  <SelectItem value="smoking-ok">Smoking allowed</SelectItem>
                  <SelectItem value="no-preference">No preference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conversation</Label>
              <Select
                value={form.chattiness ?? "moderate"}
                onValueChange={(value) => setTopLevel("chattiness", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Conversation level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chatty">Chatty</SelectItem>
                  <SelectItem value="moderate">Balanced</SelectItem>
                  <SelectItem value="quiet">Quiet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">Ride matching, chat, payments, live location, and automatic acceptance are unavailable during launch checks. Earlier stored choices for those features have no effect.</p>

          {onSave ? (
            <div className="sticky bottom-2 z-10 rounded-xl border border-border/60 bg-card/95 px-3 py-3 backdrop-blur">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Icon name="Loader" size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Preferences"
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default PreferencesSection;
