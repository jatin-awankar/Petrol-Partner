import React, { useState, useEffect } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Plus, Save, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";

interface TrustedContact {
  id: number;
  name: string;
  phone: string;
  relationship: string;
}

interface SafetySettings {
  trustedContacts?: TrustedContact[];
  settings?: {
    autoShareRideDetails: boolean;
    enableLocationTracking: boolean;
    requireDriverVerification: boolean;
    safetyCheckIns: boolean;
    [key: string]: boolean;
  };
}

interface SafetySectionProps {
  safetySettings: SafetySettings;
  onSave: (data: {
    trustedContacts: TrustedContact[];
    settings: SafetySettings["settings"];
  }) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

const SafetySection: React.FC<SafetySectionProps> = ({
  safetySettings,
  onSave,
  isExpanded,
  onToggle,
}) => {
  const [trustedContacts, setTrustedContacts] = useState<
    TrustedContact[] | null
  >(null);
  const [showAddContact, setShowAddContact] = useState<boolean>(false);
  const [newContact, setNewContact] = useState<TrustedContact>({
    id: 0,
    name: "",
    phone: "",
    relationship: "",
  });
  const [settings, setSettings] = useState<SafetySettings["settings"] | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);

  const safetyPreferences = [
    {
      id: "autoShareRide",
      label: "Auto-share ride details with trusted contacts",
      desc: "Automatically share ride information when you start a trip",
      key: "autoShare"
    },
    {
      id: "enableLocationTracking",
      label: "Enable location tracking during rides",
      desc: "Allow real-time location tracking for safety purposes",
      key: "enableLocationTracking"
    },
    {
      id: "reqDriverVerf",
      label: "Require driver verification for rides",
      desc: "Only accept rides from drivers with verified documents",
      key: "reqDriverVerf"
    },
    {
      id: "sendSafetyChecks",
      label: "Send safety check-ins during long rides",
      desc: "Receive periodic safety check-ins for rides longer than 1",
      key: "sendSafetyChecks"
    }
  ]

  // Simulate loading delay for skeleton
  useEffect(() => {
    const timer = setTimeout(() => {
      setTrustedContacts(safetySettings?.trustedContacts || []);
      setSettings(
        safetySettings?.settings || {
          autoShareRideDetails: false,
          enableLocationTracking: false,
          requireDriverVerification: false,
          safetyCheckIns: false,
        }
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [safetySettings]);

  const handleAddContact = () => {
    if (newContact?.name && newContact?.phone) {
      // Never override id from input, always generate a new one
      const { name, phone, relationship } = newContact;
      const contact = { id: Date.now(), name, phone, relationship };
      setTrustedContacts([...(trustedContacts ?? []), contact]);
      setNewContact({ id: 0, name: "", phone: "", relationship: "" });
      setShowAddContact(false);
    }
  };

  const handleRemoveContact = (id: number) => {
    setTrustedContacts((prev) =>
      (prev ?? []).filter((contact) => contact?.id !== id)
    );
  };

  const handleSettingChange = (field: any, value: any) => {
    // @ts-expect-error: 'error' prop is custom for our Input component
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setTimeout(() => {
      onSave({
        trustedContacts: trustedContacts ?? [],
        settings: settings ?? {
          autoShareRideDetails: false,
          enableLocationTracking: false,
          requireDriverVerification: false,
          safetyCheckIns: false,
        },
      });
      setIsSaving(false);
    }, 1000);
  };

  // Skeleton loader
  if (!trustedContacts || !settings) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-md mb-4 animate-pulse">
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
    <div className="bg-card border border-border rounded-lg mb-4 shadow-md">
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
            {/* Trusted Contacts */}
            <div>
              <h4 className="font-medium text-foreground mb-4">
                Trusted Contacts
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                These contacts will be notified in case of emergency or if you
                use the SOS feature.
              </p>

              {trustedContacts?.length > 0 && (
                <div className="space-y-3 mb-4">
                  {trustedContacts?.map((contact) => (
                    <div
                      key={contact?.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {contact?.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {contact?.phone}
                        </p>
                        {contact?.relationship && (
                          <p className="text-xs text-blue-500 capitalize">
                            {contact?.relationship}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveContact(contact?.id)}
                        className="text-error hover:bg-gray-100"
                      >
                        <Trash2 className="text-gray-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {showAddContact ? (
                <div className="border border-border rounded-lg p-4">
                  <h5 className="font-medium text-foreground mb-3">
                    Add Trusted Contact
                  </h5>
                  <div className="space-y-3">
                    <Label>Contact Name</Label>
                    <Input
                      type="text"
                      placeholder="e.g., John Doe"
                      value={newContact?.name}
                      onChange={(e) =>
                        setNewContact({
                          ...newContact,
                          name: e?.target?.value,
                        })
                      }
                      required
                    />
                    <Label>Phone Number</Label>
                    <Input
                      type="tel"
                      placeholder="e.g., +91 98765 43210"
                      value={newContact?.phone}
                      onChange={(e) =>
                        setNewContact({
                          ...newContact,
                          phone: e?.target?.value,
                        })
                      }
                      required
                    />
                    <Label>Relationship (Optional)</Label>
                    <Input
                      type="text"
                      placeholder="e.g., Parent, Friend, Sibling"
                      value={newContact?.relationship}
                      onChange={(e) =>
                        setNewContact({
                          ...newContact,
                          relationship: e?.target?.value,
                        })
                      }
                    />
                    <div className="flex space-x-3">
                      <Button variant="default" onClick={handleAddContact}>
                        <Plus />
                        Add Contact
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowAddContact(false);
                          setNewContact({
                            id: 0,
                            name: "",
                            phone: "",
                            relationship: "",
                          });
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
                  disabled={trustedContacts?.length >= 3}
                >
                  <Plus />
                  Add Trusted Contact{" "}
                  {trustedContacts?.length >= 3 && "(Max 3)"}
                </Button>
              )}
            </div>

            {/* Safety Preferences */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Safety Preferences
              </h4>
              <div className="space-y-3">
                {safetyPreferences.map((item) => (
                  <div key={item.id} className="flex space-x-3">
                    <Checkbox
                  id={item.id}
                  checked={settings?.autoShareRideDetails}
                  onCheckedChange={(checked) =>
                    handleSettingChange("autoShareRideDetails", checked)
                  }
                  />
                  <Label htmlFor={item.id} className="flex flex-col items-start">
                    <span>{item.label}</span>
                    <small className="text-muted-foreground">{item.desc}</small>
                  </Label>
                  </div>
                ))}
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

            <Button
              variant="default"
              onClick={handleSave}
              disabled={isSaving}
              className="mt-6"
            >
              <Save />
              {isSaving ? "Saving..." : "Save Safety Settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SafetySection;
