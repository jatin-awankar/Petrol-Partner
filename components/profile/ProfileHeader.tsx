import React, { useRef } from "react";
import { Camera, Edit, Loader2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
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
  onPhotoUpload: (file: File) => void | Promise<void>;
  onEditProfile: () => void;
  isPhotoUploading?: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user = null,
  onPhotoUpload,
  onEditProfile,
  isPhotoUploading = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!user) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-card">
        <p className="text-sm text-muted-foreground">
          Profile information is unavailable.
        </p>
      </section>
    );
  }

  const handleFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    await onPhotoUpload(file);
    inputEl.value = "";
  };

  const initials = user.name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join("") || "?";

  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-card p-4 shadow-card sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFilePick}
            />
            <Avatar className="h-20 w-20 rounded-2xl border border-border/70 bg-muted shadow-md sm:h-24 sm:w-24">
              <AvatarImage
                src={user.profilePhoto || undefined}
                alt={`${user.name}'s profile`}
                className="object-cover transition-all duration-300"
              />
              <AvatarFallback
                role="img"
                aria-label={`${user.name}'s profile placeholder`}
                className="rounded-2xl bg-lime-200 text-2xl font-semibold text-emerald-950"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPhotoUploading}
              title="Upload profile photo"
              className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70 sm:h-8 sm:w-8"
            >
              {isPhotoUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
            </button>
          </div>

          <div className="min-w-0 space-y-1.5 sm:space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="max-w-full truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {user.name}
              </h2>
              {user.isCollegeVerified && <Badge variant="outline">Historical corridor student approval</Badge>}
              {user.isDriverVerified && <Badge variant="outline">Historical corridor driver approval</Badge>}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {user.college ? `Historical college: ${user.college}` : "College affiliation is optional"}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-start lg:items-end">
          <Button
            variant="outline"
            onClick={onEditProfile}
            className="w-full sm:w-auto"
          >
            <Edit className="size-4" />
            Edit Personal Info
          </Button>
          <p className="text-center text-xs text-muted-foreground sm:text-left lg:text-right">
            JPG/PNG up to 3MB
          </p>
        </div>
      </div>
    </section>
  );
};

export default ProfileHeader;
