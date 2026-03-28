import React from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

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
}

export interface AccountSecuritySectionProps {
  securitySettings?: SecuritySettings | null;
  loginActivity?: LoginActivity[] | null;
  onSave?: (data: Partial<SecuritySettings>) => void | Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const AccountSecuritySection: React.FC<AccountSecuritySectionProps> = ({
  securitySettings = null,
  loginActivity = [],
  isExpanded,
  onToggle,
  isLoading = false,
  error = null,
}) => {
  const lastPasswordChange = securitySettings?.passwordLastChanged
    ? new Date(securitySettings.passwordLastChanged).toLocaleString()
    : "Not available";

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
        <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Icon name="Lock" size={20} className="text-primary" />
            <Skeleton width={150} height={18} />
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
        className="flex w-full items-center justify-between px-4 py-4 transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-3">
          <Icon name="Lock" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Security</h3>
            <p className="text-xs text-muted-foreground">Session visibility and account protection status.</p>
          </div>
        </div>
        <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={20} className="text-muted-foreground" />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[2600px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-4 border-t border-border/70 px-4 pb-5 pt-4">
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Password</p>
              <p className="mt-1 text-sm font-medium text-foreground">Last updated: {lastPasswordChange}</p>
              <Button
                variant="outline"
                className="mt-3"
                disabled
                title="Password update endpoint is not available yet."
              >
                Change Password (Coming soon)
              </Button>
            </article>
            <article className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Two-factor auth</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {securitySettings?.twoFactorEnabled
                  ? `Enabled (${securitySettings.twoFactorMethod || "Configured"})`
                  : "Not enabled"}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                disabled
                title="2FA setup runtime is not available in this release."
              >
                Configure 2FA (Coming soon)
              </Button>
            </article>
          </div>

          <article className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Login Activity</h4>
              <Badge variant="outline">{loginActivity?.length ?? 0} sessions</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {!loginActivity || loginActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent session activity available.</p>
              ) : (
                loginActivity.map((item) => (
                  <div
                    key={String(item.id)}
                    className="flex items-start justify-between rounded-lg border border-border/70 bg-background/80 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.device || "Unknown device"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.location, item.time, item.ipAddress].filter(Boolean).join(" • ") ||
                          "No metadata"}
                      </p>
                    </div>
                    {item.current ? <Badge variant="secondary">Current</Badge> : <Badge variant="outline">Past</Badge>}
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <h4 className="text-sm font-semibold text-foreground">Account Controls</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Device logout, data export, and account deletion are intentionally gated until admin-safe
              workflows are finalized.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled title="Coming soon: per-device session revoke.">
                Log out other devices
              </Button>
              <Button variant="outline" disabled title="Coming soon: account data export pack.">
                Download account data
              </Button>
              <Button variant="destructive" disabled title="Coming soon: verified account deletion flow.">
                Delete account
              </Button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};

export default AccountSecuritySection;
