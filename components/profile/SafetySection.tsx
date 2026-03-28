import React, { useCallback, useEffect, useMemo, useState } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Plus, Save, Trash2 } from "lucide-react";

export interface TrustedContact {
  id: number | string;
  name: string;
  phone: string;
  relationship?: string;
  email?: string;
}

export interface SafetySettingsData {
  autoShareRideDetails?: boolean;
  enableLocationTracking?: boolean;
  requireDriverVerification?: boolean;
  safetyCheckIns?: boolean;
  [key: string]: boolean | undefined;
}

export interface SafetySettings {
  trustedContacts?: TrustedContact[] | null;
  settings?: SafetySettingsData | null;
}

export interface SafetySectionProps {
  safetySettings?: SafetySettings | null;
  onSave?: (data: { trustedContacts: TrustedContact[]; settings: SafetySettingsData }) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
  maxTrustedContacts?: number;
}

const DEFAULT_SETTINGS: SafetySettingsData = {
  autoShareRideDetails: true,
  enableLocationTracking: true,
  requireDriverVerification: true,
  safetyCheckIns: true,
};

const emptyContact = { name: "", phone: "", relationship: "", email: "" };

const SafetySection: React.FC<SafetySectionProps> = ({
  safetySettings = null,
  onSave,
  isExpanded,
  onToggle,
  isLoading = false,
  error = null,
  maxTrustedContacts = 3,
}) => {
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [settings, setSettings] = useState<SafetySettingsData>(DEFAULT_SETTINGS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [contactDraft, setContactDraft] = useState(emptyContact);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setTrustedContacts(safetySettings?.trustedContacts ?? []);
    setSettings({ ...DEFAULT_SETTINGS, ...(safetySettings?.settings ?? {}) });
  }, [safetySettings]);

  const canAddContact = useMemo(
    () => trustedContacts.length < maxTrustedContacts,
    [trustedContacts.length, maxTrustedContacts],
  );

  const setToggle = useCallback((key: keyof SafetySettingsData, next: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: next }));
  }, []);

  const addContact = useCallback(() => {
    setFormError(null);
    if (!contactDraft.name.trim()) {
      setFormError("Trusted contact name is required.");
      return;
    }
    if (!contactDraft.phone.trim()) {
      setFormError("Trusted contact phone is required.");
      return;
    }
    if (trustedContacts.some((c) => c.phone.trim() === contactDraft.phone.trim())) {
      setFormError("This phone number is already present in trusted contacts.");
      return;
    }
    setTrustedContacts((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        name: contactDraft.name.trim(),
        phone: contactDraft.phone.trim(),
        relationship: contactDraft.relationship.trim() || undefined,
        email: contactDraft.email.trim() || undefined,
      },
    ]);
    setContactDraft(emptyContact);
    setShowAddForm(false);
  }, [contactDraft, trustedContacts]);

  const removeContact = useCallback((id: string | number) => {
    setTrustedContacts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave({ trustedContacts, settings });
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2200);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, settings, trustedContacts]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
        <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Icon name="Shield" size={20} className="text-primary" />
            <Skeleton width={140} height={18} />
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
        className="flex w-full items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Icon name="Shield" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Safety</h3>
            <p className="text-xs text-muted-foreground">Trusted contacts and trip-protection settings.</p>
          </div>
          <Badge variant="outline">{trustedContacts.length} contacts</Badge>
        </div>
        <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={20} className="text-muted-foreground" />
      </button>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[2800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-5 border-t border-border/70 px-4 pb-5 pt-4 sm:px-5">
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="rounded-lg border border-emerald-300/40 bg-emerald-100/40 p-3 text-sm text-emerald-700">
              Safety settings updated.
            </p>
          ) : null}

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">Trusted Contacts</h4>
              <Badge variant="outline">
                {trustedContacts.length}/{maxTrustedContacts}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {trustedContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add at least one trusted contact to strengthen safety during intercity trips.
                </p>
              ) : (
                trustedContacts.map((contact) => (
                  <div key={String(contact.id)} className="flex items-center justify-between rounded-lg border border-border/70 bg-background/80 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[contact.phone, contact.relationship].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeContact(contact.id)}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            {showAddForm ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 sm:grid-cols-2">
                {formError ? (
                  <p className="sm:col-span-2 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                    {formError}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={contactDraft.name}
                    onChange={(e) => setContactDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ananya Sharma"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={contactDraft.phone}
                    onChange={(e) => setContactDraft((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Relationship (optional)</Label>
                  <Input
                    value={contactDraft.relationship}
                    onChange={(e) => setContactDraft((prev) => ({ ...prev, relationship: e.target.value }))}
                    placeholder="Sister / Friend / Parent"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email (optional)</Label>
                  <Input
                    value={contactDraft.email}
                    onChange={(e) => setContactDraft((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="contact@example.com"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button onClick={addContact}>
                    <Plus className="size-4" />
                    Add Contact
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="mt-3" disabled={!canAddContact} onClick={() => setShowAddForm(true)}>
                <Plus className="size-4" />
                Add Contact
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <h4 className="text-sm font-semibold text-foreground">Trip Safety Controls</h4>
            <div className="mt-3 space-y-2">
              {[
                ["autoShareRideDetails", "Auto-share trip details with trusted contacts"],
                ["enableLocationTracking", "Enable location tracking during active rides"],
                ["requireDriverVerification", "Match only with verified drivers for offers"],
                ["safetyCheckIns", "Enable periodic safety check-ins on longer rides"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={Boolean(settings[key])} onCheckedChange={(checked) => setToggle(key as keyof SafetySettingsData, checked === true)} />
                  <span className="text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <h4 className="text-sm font-semibold text-foreground">Emergency Tools</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              In-app SOS and emergency call automation are being integrated with live trip state.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled title="Coming soon: in-ride SOS flow.">
                Test SOS
              </Button>
              <Button variant="outline" disabled title="Coming soon: one-tap trusted contact ping.">
                Test Location Share
              </Button>
            </div>
          </div>

          {onSave ? (
            <div className="sticky bottom-2 z-10 rounded-xl border border-border/60 bg-card/95 px-3 py-3 backdrop-blur">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Icon name="Loader" size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Save Safety
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default SafetySection;
