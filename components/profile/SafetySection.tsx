import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Plus, Save, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";

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
  onSave?: (data: {
    trustedContacts: TrustedContact[];
    settings: SafetySettingsData;
  }) => void | Promise<void>;
  onAddContact?: (contact: Omit<TrustedContact, "id">) => void | Promise<void>;
  onRemoveContact?: (contactId: number | string) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
  maxTrustedContacts?: number;
}

const SafetySection: React.FC<SafetySectionProps> = ({
  safetySettings = null,
  onSave,
  onAddContact,
  onRemoveContact,
  isExpanded,
  onToggle,
  isLoading: externalLoading = false,
  error: externalError = null,
  maxTrustedContacts = 3,
}) => {
  const [isInternalLoading, setIsInternalLoading] = useState(true);
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [showAddContact, setShowAddContact] = useState<boolean>(false);
  const [newContact, setNewContact] = useState<Omit<TrustedContact, "id">>({
    name: "",
    phone: "",
    relationship: "",
    email: "",
  });
  const [settings, setSettings] = useState<SafetySettingsData>({
    autoShareRideDetails: false,
    enableLocationTracking: false,
    requireDriverVerification: false,
    safetyCheckIns: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Derived state
  const isLoading = externalLoading || isInternalLoading;
  const canAddMoreContacts = (trustedContacts?.length ?? 0) < maxTrustedContacts;

  // Safety preferences configuration
  const safetyPreferences = useMemo(() => [
    {
      id: "autoShareRide",
      label: "Auto-share ride details with trusted contacts",
      desc: "Automatically share ride information when you start a trip",
      key: "autoShareRideDetails" as const,
    },
    {
      id: "enableLocationTracking",
      label: "Enable location tracking during rides",
      desc: "Allow real-time location tracking for safety purposes",
      key: "enableLocationTracking" as const,
    },
    {
      id: "reqDriverVerf",
      label: "Require driver verification for rides",
      desc: "Only accept rides from drivers with verified documents",
      key: "requireDriverVerification" as const,
    },
    {
      id: "sendSafetyChecks",
      label: "Send safety check-ins during long rides",
      desc: "Receive periodic safety check-ins for rides longer than 1 hour",
      key: "safetyCheckIns" as const,
    },
  ], []);

  // Initialize from props
  useEffect(() => {
    if (safetySettings !== null) {
      const timer = setTimeout(() => {
        setTrustedContacts(safetySettings?.trustedContacts ?? []);
        setSettings({
          autoShareRideDetails: false,
          enableLocationTracking: false,
          requireDriverVerification: false,
          safetyCheckIns: false,
          ...(safetySettings?.settings ?? {}),
        });
        setIsInternalLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIsInternalLoading(false);
    }
  }, [safetySettings]);

  // Phone number validation helper
  const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(phone.trim());
  };

  const handleAddContact = useCallback(async () => {
    setContactError(null);

    // Validation
    if (!newContact?.name?.trim()) {
      setContactError("Contact name is required");
      return;
    }

    if (!newContact?.phone?.trim()) {
      setContactError("Phone number is required");
      return;
    }

    if (!isValidPhone(newContact.phone)) {
      setContactError("Please enter a valid phone number");
      return;
    }

    // Check if contact already exists
    const phoneExists = trustedContacts.some(
      (contact) => contact.phone?.trim() === newContact.phone.trim()
    );
    if (phoneExists) {
      setContactError("This phone number is already in your trusted contacts");
      return;
    }

    // Check limit
    if (!canAddMoreContacts) {
      setContactError(`Maximum ${maxTrustedContacts} trusted contacts allowed`);
      return;
    }

    try {
      const contactToAdd: TrustedContact = {
        id: Date.now(),
        name: newContact.name.trim(),
        phone: newContact.phone.trim(),
        relationship: newContact.relationship?.trim() || undefined,
        email: newContact.email?.trim() || undefined,
      };

      if (onAddContact) {
        await onAddContact(contactToAdd);
      }

      setTrustedContacts((prev) => [...prev, contactToAdd]);
      setNewContact({ name: "", phone: "", relationship: "", email: "" });
      setShowAddContact(false);
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Failed to add contact. Please try again."
      );
    }
  }, [newContact, trustedContacts, canAddMoreContacts, maxTrustedContacts, onAddContact]);

  const handleRemoveContact = useCallback(async (id: number | string) => {
    if (!id) return;

    try {
      if (onRemoveContact) {
        await onRemoveContact(id);
      }
      setTrustedContacts((prev) => prev.filter((contact) => contact?.id !== id));
    } catch (err) {
      console.error("Failed to remove contact:", err);
      // Optionally show error to user
    }
  }, [onRemoveContact]);

  const handleSettingChange = useCallback((field: keyof SafetySettingsData, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await onSave({
        trustedContacts: trustedContacts ?? [],
        settings: settings ?? {
          autoShareRideDetails: false,
          enableLocationTracking: false,
          requireDriverVerification: false,
          safetyCheckIns: false,
        },
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save safety settings:", err);
      // Error is handled by parent component via error prop
    } finally {
      setIsSaving(false);
    }
  }, [onSave, trustedContacts, settings]);

  // Skeleton loader
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="Shield" size={20} className="text-primary" />
            <Skeleton
              width={160}
              height={20}
              className="rounded animate-bounce"
            />
          </div>
          <Skeleton width={20} height={20} className="rounded animate-bounce" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-6">
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                width="100%"
                height={64}
                className="rounded-lg animate-pulse"
              />
            ))}
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
          <Icon name="Shield" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Safety Settings</h3>
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
        <div className="px-4 pb-4 border-t border-border">
          <div className="pt-4 space-y-6">
            {saveSuccess && (
              <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                <p className="text-sm text-success">Safety settings saved successfully!</p>
              </div>
            )}
            
            {externalError && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
                <p className="text-sm text-error">{externalError}</p>
              </div>
            )}

            {/* Trusted Contacts */}
            <div>
              <h4 className="font-medium text-foreground mb-4">
                Trusted Contacts
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                These contacts will be notified in case of emergency or if you
                use the SOS feature.
              </p>

              {trustedContacts && trustedContacts.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {trustedContacts.map((contact) => {
                    if (!contact?.id) return null;
                    
                    return (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {contact.name || "Unknown"}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {contact.phone || "No phone number"}
                          </p>
                          {contact.relationship && (
                            <p className="text-xs text-blue-500 capitalize mt-1">
                              {contact.relationship}
                            </p>
                          )}
                          {contact.email && (
                            <p className="text-xs text-muted-foreground truncate">
                              {contact.email}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveContact(contact.id)}
                          className="text-error hover:bg-error/10 shrink-0 ml-2"
                          title="Remove contact"
                        >
                          <Trash2 className="text-gray-400" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mb-4 p-4 border border-border rounded-lg text-center">
                  <Icon name="UserPlus" size={32} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No trusted contacts added yet
                  </p>
                </div>
              )}

              {showAddContact ? (
                <div className="border border-border rounded-lg p-4">
                  <h5 className="font-medium text-foreground mb-3">
                    Add Trusted Contact
                  </h5>
                  {contactError && (
                    <div className="mb-3 p-2 bg-error/10 border border-error/20 rounded text-sm text-error">
                      {contactError}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">Contact Name *</Label>
                      <Input
                        id="contact-name"
                        type="text"
                        placeholder="e.g., John Doe"
                        value={newContact.name ?? ""}
                        onChange={(e) => {
                          setNewContact({
                            ...newContact,
                            name: e.target.value,
                          });
                          setContactError(null);
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-phone">Phone Number *</Label>
                      <Input
                        id="contact-phone"
                        type="tel"
                        placeholder="e.g., +91 98765 43210"
                        value={newContact.phone ?? ""}
                        onChange={(e) => {
                          setNewContact({
                            ...newContact,
                            phone: e.target.value,
                          });
                          setContactError(null);
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-relationship">Relationship (Optional)</Label>
                      <Input
                        id="contact-relationship"
                        type="text"
                        placeholder="e.g., Parent, Friend, Sibling"
                        value={newContact.relationship ?? ""}
                        onChange={(e) =>
                          setNewContact({
                            ...newContact,
                            relationship: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">Email (Optional)</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="e.g., john@example.com"
                        value={newContact.email ?? ""}
                        onChange={(e) =>
                          setNewContact({
                            ...newContact,
                            email: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex space-x-3">
                      <Button 
                        variant="default" 
                        onClick={handleAddContact}
                        disabled={!newContact.name?.trim() || !newContact.phone?.trim()}
                      >
                        <Plus />
                        Add Contact
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowAddContact(false);
                          setNewContact({ name: "", phone: "", relationship: "", email: "" });
                          setContactError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowAddContact(true)}
                  disabled={!canAddMoreContacts}
                >
                  <Plus />
                  Add Trusted Contact{" "}
                  {!canAddMoreContacts && `(Max ${maxTrustedContacts})`}
                </Button>
              )}
            </div>

            {/* Safety Preferences */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Safety Preferences
              </h4>
              <div className="space-y-4">
                {safetyPreferences.map((item) => {
                  const settingValue = settings?.[item.key] ?? false;
                  
                  return (
                    <div 
                      key={item.id} 
                      className="flex items-start space-x-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        id={item.id}
                        checked={settingValue}
                        onCheckedChange={(checked) =>
                          handleSettingChange(
                            item.key, 
                            checked === true
                          )
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
                  );
                })}
              </div>
            </div>

            {/* Emergency Features */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Emergency Features
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon
                      name="Phone"
                      size={20}
                      className="text-error/50 fill-current"
                    />
                    <h5 className="font-medium text-foreground">
                      Emergency Call
                    </h5>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Quick access to emergency services (911/100)
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Test Emergency Call
                  </Button>
                </div>

                <div className="p-4 border border-border rounded-lg">
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon name="MapPin" size={20} className="text-success " />
                    <h5 className="font-medium text-foreground">
                      Share Location
                    </h5>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Instantly share your location with trusted contacts
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Test Location Share
                  </Button>
                </div>
              </div>
            </div>

            {/* Incident History */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Safety Incident History
              </h4>
              <div className="text-center py-8">
                <Icon
                  name="Shield"
                  size={48}
                  className="text-green-500 mx-auto mb-3 fill-green-500/60"
                />
                <p className="text-muted-foreground">
                  No safety incidents reported
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Keep up the safe riding practices!
                </p>
              </div>
            </div>

            {onSave && (
              <Button
                variant="default"
                onClick={handleSave}
                disabled={isSaving || externalLoading}
                className="mt-6 w-full sm:w-auto"
              >
                {isSaving ? (
                  <>
                    <Icon name="Loader" className="animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save />
                    Save Safety Settings
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SafetySection;
