import React, { useMemo } from "react";
import { Edit, Star } from "lucide-react";

import AppImage from "../AppImage";
import Icon from "../AppIcon";
import VerificationBadge from "../ui/VerificationBadge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface UserProfile {
  name: string;
  email: string;
  college?: string;
  profilePhoto?: string;
  isCollegeVerified?: boolean;
  isDriverVerified?: boolean;
  rating?: number;
  totalRides?: number;
}

interface ProfileHeaderProps {
  user: UserProfile | null;
  onPhotoUpload: (file: File) => void;
  onEditProfile: () => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user = null,
  onEditProfile,
}) => {
  const completion = useMemo(() => {
    if (!user) return 0;

    const checks = [
      Boolean(user.name),
      Boolean(user.email),
      Boolean(user.college),
      Boolean(user.isCollegeVerified),
      Boolean(user.isDriverVerified),
    ];

    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [user]);

  if (!user) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-card">
        <p className="text-sm text-muted-foreground">
          Profile information is unavailable.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card to-muted/20 p-4 shadow-card sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-border/70 bg-muted shadow-md">
              <AppImage
                src={user.profilePhoto ?? ""}
                alt={`${user.name}'s profile`}
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              disabled
              title="Photo upload is coming soon"
              className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground opacity-80"
            >
              <Icon name="Camera" size={14} />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {user.name}
              </h1>
              <VerificationBadge
                isVerified={user.isCollegeVerified}
                verificationType="identity"
                size={18}
              />
              {user.isDriverVerified ? (
                <VerificationBadge
                  isVerified
                  verificationType="driver"
                  size={18}
                />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-sm text-muted-foreground">
              {user.college ?? "College not provided"}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-full bg-warning/15 px-3 py-1 text-sm text-foreground">
                <Star className="size-3.5 fill-warning text-warning" />
                <span>{Number(user.rating ?? 0).toFixed(1)}</span>
              </div>
              <Badge variant="outline">
                {user.totalRides ?? 0} rides completed
              </Badge>
              <Badge variant={completion >= 80 ? "secondary" : "outline"}>
                Profile completion {completion}%
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Button variant="outline" onClick={onEditProfile}>
            <Edit className="size-4" />
            Edit Personal Info
          </Button>
          <p className="text-xs text-muted-foreground">
            Photo upload coming soon
          </p>
        </div>
      </div>
    </section>
  );
};

export default ProfileHeader;
