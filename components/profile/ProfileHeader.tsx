"use client";
import React, { useEffect, useState } from "react";
import AppImage from "../AppImage";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Edit } from "lucide-react";
import Skeleton from "react-loading-skeleton";
import VerificationBadge from "../ui/VerificationBadge";

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
  onPhotoUpload,
  onEditProfile,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800); // skeleton for 0.8s
    return () => clearTimeout(timer);
  }, [user]);

  const handlePhotoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target?.files?.[0];
    if (file) {
      setIsUploading(true);
      // Mock upload delay — replace with actual upload API call
      setTimeout(() => {
        onPhotoUpload(file);
        setIsUploading(false);
      }, 1500);
    }
  };

  if (isLoading) {
    // Skeleton Loading
    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-6 mb-6 animate-pulse">
        <div className="flex flex-col sm:flex-row items-center p-2 space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="w-24 h-24 rounded-full bg-muted" />
          <div className="flex-1 space-y-3">
            <Skeleton
              width="50%"
              height={24}
              className="bg-muted rounded animate-pulse"
            />
            <Skeleton
              width="33.33%"
              height={16}
              className="bg-muted rounded animate-pulse"
            />
            <Skeleton
              width="25%"
              height={16}
              className="bg-muted rounded animate-pulse"
            />
          </div>
          <Skeleton
            width={96}
            height={40}
            className="bg-muted rounded animate-pulse"
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 mb-6 shadow-md">
        Profile Now Found
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 mb-6 shadow-md">
      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
        {/* Profile Photo */}
        <div className="relative group">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-muted border-4 border-background shadow-soft">
            <AppImage
              src={user.profilePhoto ?? ""}
              alt={`${user.name}'s profile`}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Upload Button */}
          <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors shadow-soft">
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon name="Camera" size={16} />
            )}
          </label>
        </div>

        {/* User Info */}
        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start space-x-2 mb-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {user.name}
            </h1>
            <VerificationBadge
              isVerified={user.isCollegeVerified}
              verificationType="identity"
              size={18}
            />
            {user.isDriverVerified && (
              <VerificationBadge
                isVerified
                verificationType="driver"
                size={18}
              />
            )}
          </div>

          <p className="text-muted-foreground mb-1">{user.email}</p>
          {user.college && (
            <p className="text-sm text-muted-foreground mb-3">{user.college}</p>
          )}

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
            <div className="flex items-center space-x-1">
              <Icon
                name="Star"
                size={20}
                className="text-warning fill-current"
              />
              <span className="font-medium">{user.rating ?? 0}</span>
              <span className="text-muted-foreground">
                ({user.totalRides ?? 0} rides)
              </span>
            </div>

            {user.isCollegeVerified ? (
              <div className="flex items-center space-x-1 text-green-600">
                <VerificationBadge
                  isVerified
                  verificationType="college"
                  size={24}
                  className=" text-white fill-green-500"
                />
                <span>Verified Student</span>
              </div>
            ) : (
              <div className="flex item-center space-x-1 text-red-300">
                <Icon name="BadgeX" size={20} className="text-red-300" />
                <span>Not verified</span>
              </div>
            )}
          </div>
        </div>

        {/* Edit Button */}
        <Button
          variant="outline"
          onClick={onEditProfile}
          className="shrink-0 transition-transform hover:scale-[1.02]"
        >
          <Edit />
          Edit Profile
        </Button>
      </div>
    </div>
  );
};

export default ProfileHeader;
