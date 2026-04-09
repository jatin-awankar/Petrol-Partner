"use client";

import React from "react";
import Image from "@/components/AppImage";
import Icon from "@/components/AppIcon";
import Skeleton from "react-loading-skeleton";
import VerificationBadge from "../ui/VerificationBadge";

interface Profile {
  id?: string;
  name?: string;
  avatar?: string;
  college?: string;
  year?: string;
  rating?: number;
  reviewCount?: number;
  totalRides?: number;
  joinedDate?: string;
  bio?: string;
  isVerified?: boolean;
}

interface ProfileInfoProps {
  profile?: Profile | null;
  role?: "driver" | "passenger";
  loading?: boolean;
}

const ProfileInfo: React.FC<ProfileInfoProps> = ({
  profile = null,
  role = "driver",
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 md:p-5 shadow-soft">
        <Skeleton height={88} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 text-center text-muted-foreground">
        No profile data available.
      </div>
    );
  }

  const {
    name,
    avatar,
    college,
    year,
    rating,
    reviewCount,
    totalRides,
    joinedDate,
    bio,
    isVerified,
  } = profile;

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 md:p-5 shadow-soft">
      <div className="flex items-start gap-3 md:gap-4">
        <div className="relative shrink-0">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden bg-muted border border-border/70">
            <Image
              src={
                avatar ||
                "https://cdn-icons-png.flaticon.com/512/3177/3177440.png"
              }
              alt={`${name ?? "User"} profile`}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-1 -right-1">
            <VerificationBadge
              isVerified={!!isVerified}
              verificationType="college"
              size={16}
              className="text-success-foreground fill-success"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base md:text-lg font-semibold text-foreground truncate">
              {name ?? "Unknown User"}
            </h3>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary capitalize">
              {role}
            </span>
            {rating ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-foreground">
                <Icon
                  name="Star"
                  size={12}
                  className="text-warning fill-current"
                />
                {rating} ({reviewCount ?? 0})
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                New user
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground truncate">
            {college ?? "College not specified"}
            {year ? ` • ${year}` : ""}
          </p>

          {bio && (
            <p className="mt-2 text-sm text-foreground line-clamp-2">{bio}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {typeof totalRides !== "undefined" && (
              <span className="inline-flex items-center gap-1">
                <Icon name="Bike" size={13} />
                {totalRides} rides
              </span>
            )}
            {joinedDate && (
              <span className="inline-flex items-center gap-1">
                <Icon name="Clock3" size={13} />
                Joined {joinedDate}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfileInfo;
