import React, { useState, useEffect } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Download, Edit, LogOut, Save, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface SecuritySettings {
  twoFactorEnabled?: boolean;
  // Add other security settings fields as needed
}

interface AccountSecuritySectionProps {
  securitySettings: SecuritySettings;
  onSave: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}

const AccountSecuritySection: React.FC<AccountSecuritySectionProps> = ({
  securitySettings,
  onSave,
  isExpanded,
  onToggle,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEnabling2FA, setIsEnabling2FA] = useState(false);
  const [loginActivity, setLoginActivity] = useState<
    Array<{
      id: number;
      device: string;
      location?: string;
      time?: string;
      current?: boolean;
    }>
  >([]);

  // Simulated loading for skeleton effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setTwoFactorEnabled(securitySettings?.twoFactorEnabled ?? false);
      setLoginActivity([
        {
          id: 1,
          device: "iPhone 13 Pro",
          location: "Mumbai, Maharashtra",
          time: "2 hours ago",
          current: true,
        },
        {
          id: 2,
          device: "Chrome on Windows",
          location: "Mumbai, Maharashtra",
          time: "1 day ago",
          current: false,
        },
        {
          id: 3,
          device: "Safari on MacBook",
          location: "Pune, Maharashtra",
          time: "3 days ago",
          current: false,
        },
      ]);
      setIsLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [securitySettings]);

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    setIsChangingPassword(true);
    setTimeout(() => {
      setIsChangingPassword(false);
      setShowPasswordForm(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      alert("Password changed successfully");
    }, 1500);
  };

  const handleToggle2FA = async () => {
    setIsEnabling2FA(true);
    setTimeout(() => {
      const newValue = !twoFactorEnabled;
      setTwoFactorEnabled(newValue);
      onSave?.();
      setIsEnabling2FA(false);
    }, 1000);
  };

  const handleLogoutDevice = (deviceId: number) => {
    alert(`Logged out from device ${deviceId}`);
  };

  const handleDeleteAccount = () => {
    if (
      window.confirm(
        "Are you sure you want to delete your account? This action cannot be undone."
      )
    ) {
      alert(
        "Account deletion process initiated. You will receive an email with further instructions."
      );
    }
  };

  // 🔸 Skeleton loader
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="Lock" size={20} className="text-primary" />
            <Skeleton
              width={160}
              height={20}
              className="rounded animate-bounce"
            />
          </div>
          <Skeleton width={20} height={20} className="rounded animate-bounce" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                width="100%"
                height={80}
                className="rounded-lg animate-pulse"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 🔹 Main section
  return (
    <div className="bg-card border border-border rounded-lg shadow-card">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Icon name="Lock" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Account Security</h3>
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
            {/* Password Management */}
            <div>
              <h4 className="font-medium text-foreground mb-4">Password</h4>
              {!showPasswordForm ? (
                <div className="flex flex-col sm:flex-row gap-2 justify-between p-3 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">Password</p>
                    <p className="text-sm text-muted-foreground">
                      Last changed 30 days ago
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    <Edit />
                    Change Password
                  </Button>
                </div>
              ) : (
                <div className="border border-border rounded-lg p-4">
                  <h5 className="font-medium text-foreground mb-3">
                    Change Password
                  </h5>
                  <div className="space-y-3">
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          currentPassword: e.target.value,
                        })
                      }
                      required
                    />
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          newPassword: e.target.value,
                        })
                      }
                      required
                    />
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          confirmPassword: e.target.value,
                        })
                      }
                      required
                    />
                    <div className="flex space-x-3">
                      <Button
                        variant="default"
                        onClick={handlePasswordChange}
                        disabled={isChangingPassword}
                      >
                        <Save />
                        Update Password
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowPasswordForm(false);
                          setPasswordData({
                            currentPassword: "",
                            newPassword: "",
                            confirmPassword: "",
                          });
                        }}
                        disabled={isChangingPassword}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Two-Factor Authentication */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Two-Factor Authentication
              </h4>
              <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium text-foreground">2FA Protection</p>
                  <p className="text-sm text-muted-foreground">
                    {twoFactorEnabled
                      ? "Enabled via SMS"
                      : "Add an extra layer of security"}
                  </p>
                </div>
                <Button
                  variant={twoFactorEnabled ? "destructive" : "default"}
                  onClick={handleToggle2FA}
                  disabled={isEnabling2FA}
                >
                  {isEnabling2FA ? (
                    <Icon name="Loader" className="animate-spin mr-2" />
                  ) : (
                    <Icon name={twoFactorEnabled ? "ShieldOff" : "Shield"} />
                  )}
                  {twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
                </Button>
              </div>
            </div>

            {/* Login Activity */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Login Activity
              </h4>
              <div className="space-y-3">
                {loginActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <Icon
                        name={
                          activity.device.includes("iPhone")
                            ? "Smartphone"
                            : "Monitor"
                        }
                        size={20}
                        className="text-muted-foreground"
                      />
                      <div>
                        <p className="font-medium text-foreground">
                          {activity.device}
                          {activity.current && (
                            <span className="ml-2 text-xs bg-success/10 text-success px-2 py-1 rounded-full">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {activity.location} • {activity.time}
                        </p>
                      </div>
                    </div>
                    {!activity.current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLogoutDevice(activity.id)}
                        className="text-error hover:text-error"
                      >
                        <LogOut className="text-gray-400" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Account Management */}
            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Account Management
              </h4>
              <div className="space-y-3">
                <div className="p-3 border border-border rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-2 justify-between">
                    <div>
                      <p className="font-medium text-foreground">
                        Download Account Data
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Get a copy of your account information and ride history
                      </p>
                    </div>
                    <Button variant="outline">
                      <Download />
                      Download
                    </Button>
                  </div>
                </div>

                <div className="p-3 border border-error/20 bg-error/5 rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-2 justify-between">
                    <div>
                      <p className="font-medium text-error">Delete Account</p>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all associated data
                      </p>
                    </div>
                    <Button variant="destructive" onClick={handleDeleteAccount}>
                      <Trash2 />
                      Delete Account
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSecuritySection;
