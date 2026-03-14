import React, { useState, useEffect, useCallback } from "react";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import { Download, Edit, LogOut, Save, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export interface LoginActivity {
  id: number | string;
  device: string;
  location?: string;
  time?: string;
  current?: boolean;
  ipAddress?: string;
  lastActive?: string;
}

export interface SecuritySettings {
  twoFactorEnabled?: boolean;
  twoFactorMethod?: "SMS" | "Email" | "App";
  passwordLastChanged?: string;
  [key: string]: unknown;
}

export interface AccountSecuritySectionProps {
  securitySettings?: SecuritySettings | null;
  loginActivity?: LoginActivity[] | null;
  onSave?: (data: Partial<SecuritySettings>) => void | Promise<void>;
  onPasswordChange?: (passwords: {
    currentPassword: string;
    newPassword: string;
  }) => void | Promise<void>;
  onToggle2FA?: (enabled: boolean) => void | Promise<void>;
  onLogoutDevice?: (deviceId: number | string) => void | Promise<void>;
  onDownloadData?: () => void | Promise<void>;
  onDeleteAccount?: () => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const AccountSecuritySection: React.FC<AccountSecuritySectionProps> = ({
  securitySettings = null,
  loginActivity = null,
  onSave,
  onPasswordChange,
  onToggle2FA,
  onLogoutDevice,
  onDownloadData,
  onDeleteAccount,
  isExpanded,
  onToggle,
  isLoading: externalLoading = false,
  error: externalError = null,
}) => {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"SMS" | "Email" | "App">("SMS");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEnabling2FA, setIsEnabling2FA] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const isLoading = externalLoading;
  const displayedLoginActivity = loginActivity ??
    (securitySettings && "loginActivity" in securitySettings
      ? (securitySettings.loginActivity as LoginActivity[]) ?? []
      : []);
  const passwordLastChanged = securitySettings?.passwordLastChanged ??
    (securitySettings && "lastPasswordChange" in securitySettings
      ? (securitySettings.lastPasswordChange as string | undefined)
      : null);

  useEffect(() => {
    if (securitySettings !== null || loginActivity !== null) {
      setTwoFactorEnabled(securitySettings?.twoFactorEnabled ?? false);
      setTwoFactorMethod(securitySettings?.twoFactorMethod ?? "SMS");
    }
  }, [securitySettings, loginActivity]);

  const handlePasswordChange = useCallback(async () => {
    if (!passwordData.currentPassword.trim()) {
      setPasswordError("Current password is required");
      return;
    }

    if (!passwordData.newPassword.trim()) {
      setPasswordError("New password is required");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordError(null);
    setIsChangingPassword(true);

    try {
      if (onPasswordChange) {
        await onPasswordChange({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        });
      }

      setPasswordSuccess(true);
      setShowPasswordForm(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  }, [passwordData, onPasswordChange]);

  const handleToggle2FA = useCallback(async () => {
    setIsEnabling2FA(true);
    const newValue = !twoFactorEnabled;

    try {
      if (onToggle2FA) {
        await onToggle2FA(newValue);
      }
      setTwoFactorEnabled(newValue);
      if (onSave) {
        await onSave({ twoFactorEnabled: newValue });
      }
    } catch (err) {
      console.error("Failed to toggle 2FA:", err);
    } finally {
      setIsEnabling2FA(false);
    }
  }, [twoFactorEnabled, onToggle2FA, onSave]);

  const handleLogoutDevice = useCallback(async (deviceId: number | string) => {
    if (!deviceId) return;
    try {
      if (onLogoutDevice) {
        await onLogoutDevice(deviceId);
      }
    } catch (err) {
      console.error("Failed to logout device:", err);
    }
  }, [onLogoutDevice]);

  const handleDeleteAccount = useCallback(() => {
    if (
      window.confirm(
        "Are you sure you want to delete your account? This action cannot be undone."
      )
    ) {
      if (onDeleteAccount) {
        onDeleteAccount();
      }
    }
  }, [onDeleteAccount]);

  const handleDownloadData = useCallback(async () => {
    try {
      if (onDownloadData) {
        await onDownloadData();
      }
    } catch (err) {
      console.error("Failed to download data:", err);
    }
  }, [onDownloadData]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="Lock" size={20} className="text-primary" />
            <Skeleton width={160} height={20} className="rounded" />
          </div>
          <Skeleton width={20} height={20} className="rounded" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={80} className="rounded-lg" />
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
          <Icon name="Lock" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Account Security</h3>
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground"
        />
      </button>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 border-t border-border">
          <div className="pt-4 space-y-6">
            <div>
              <h4 className="font-medium text-foreground mb-4">Password</h4>
              {passwordSuccess && (
                <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-sm text-success">Password changed successfully!</p>
                </div>
              )}

              {externalError && (
                <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg">
                  <p className="text-sm text-error">{externalError}</p>
                </div>
              )}

              {!showPasswordForm ? (
                <div className="flex flex-col sm:flex-row gap-2 justify-between p-3 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">Password</p>
                    <p className="text-sm text-muted-foreground">
                      {passwordLastChanged
                        ? `Last changed ${passwordLastChanged}`
                        : "Password has never been changed"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordForm(true);
                      setPasswordError(null);
                    }}
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
                  {passwordError && (
                    <div className="mb-3 p-2 bg-error/10 border border-error/20 rounded text-sm text-error">
                      {passwordError}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => {
                          setPasswordData({
                            ...passwordData,
                            currentPassword: e.target.value,
                          });
                          setPasswordError(null);
                        }}
                        required
                        disabled={isChangingPassword}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => {
                          setPasswordData({
                            ...passwordData,
                            newPassword: e.target.value,
                          });
                          setPasswordError(null);
                        }}
                        required
                        disabled={isChangingPassword}
                        minLength={8}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Must be at least 8 characters
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => {
                          setPasswordData({
                            ...passwordData,
                            confirmPassword: e.target.value,
                          });
                          setPasswordError(null);
                        }}
                        required
                        disabled={isChangingPassword}
                        minLength={8}
                      />
                    </div>
                    <div className="flex space-x-3">
                      <Button
                        variant="default"
                        onClick={handlePasswordChange}
                        disabled={isChangingPassword || !passwordData.currentPassword || !passwordData.newPassword}
                      >
                        {isChangingPassword ? (
                          <>
                            <Icon name="Loader" className="animate-spin mr-2" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Save />
                            Update Password
                          </>
                        )}
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
                          setPasswordError(null);
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

            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">Two-Factor Authentication</h4>
              <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium text-foreground">2FA Protection</p>
                  <p className="text-sm text-muted-foreground">
                    {twoFactorEnabled
                      ? `Enabled via ${twoFactorMethod}`
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

            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">Login Activity</h4>
              {displayedLoginActivity.length > 0 ? (
                <div className="space-y-3">
                  {displayedLoginActivity.map((activity) => {
                    if (!activity?.id || !activity?.device) return null;

                    const deviceName = activity.device || "Unknown Device";
                    const isMobile = deviceName.toLowerCase().includes("iphone") ||
                      deviceName.toLowerCase().includes("android") ||
                      deviceName.toLowerCase().includes("mobile");

                    return (
                      <div
                        key={activity.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <Icon
                            name={isMobile ? "Smartphone" : "Monitor"}
                            size={20}
                            className="text-muted-foreground shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">
                              {deviceName}
                              {activity.current && (
                                <span className="ml-2 text-xs bg-success/10 text-success px-2 py-1 rounded-full">
                                  Current
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {[activity.location, activity.time]
                                .filter(Boolean)
                                .join(" - ") || "No location information"}
                              {activity.ipAddress && ` - ${activity.ipAddress}`}
                            </p>
                            {activity.lastActive && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Last active: {activity.lastActive}
                              </p>
                            )}
                          </div>
                        </div>
                        {!activity.current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLogoutDevice(activity.id)}
                            className="text-error hover:text-error shrink-0 ml-2"
                            title="Logout from this device"
                          >
                            <LogOut className="text-gray-400" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 border border-border rounded-lg">
                  <Icon name="Monitor" size={32} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No login activity found</p>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">Account Management</h4>
              <div className="space-y-3">
                <div className="p-3 border border-border rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-2 justify-between">
                    <div>
                      <p className="font-medium text-foreground">Download Account Data</p>
                      <p className="text-sm text-muted-foreground">
                        Get a copy of your account information and ride history
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleDownloadData}>
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
