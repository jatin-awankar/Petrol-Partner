'use client';

import React from 'react';
import Image from '@/components/AppImage';
import Icon from '@/components/AppIcon';
import Skeleton from 'react-loading-skeleton';
import VerificationBadge from '../ui/VerificationBadge';

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
  role?: 'driver' | 'passenger';
  loading?: boolean;
}

/* ---------- Error Boundary ---------- */
class ProfileInfoErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ProfileInfo error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card p-4 rounded-lg border border-border text-destructive">
          Something went wrong loading the profile.
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------- Component ---------- */
const ProfileInfo: React.FC<ProfileInfoProps> = ({
  profile = null,
  role = 'driver',
  loading = false,
}) => {
  // Show skeleton while loading
  if (loading) {
    return (
      <div className="bg-card rounded-lg p-4 border border-border shadow-soft">
        <div className="flex items-start space-x-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-muted">
              <Skeleton className="w-16 h-16 rounded-full" />
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-20" />
            </div>

            <Skeleton className="h-4 w-1/2 mb-2" />

            <div className="mb-2">
              <Skeleton className="h-12 w-full" />
            </div>

            <div className="flex items-center space-x-4 mt-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If no profile and not loading, show a friendly empty state
  if (!profile) {
    return (
      <div className="bg-card p-4 rounded-lg border border-border text-center text-muted-foreground">
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
    <div className="bg-card rounded-lg p-4 border border-border shadow-soft">
      <div className="flex items-start space-x-4">
        {/* Avatar */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-muted">
            <Image
              src={
                avatar ||
                'https://cdn-icons-png.flaticon.com/512/3177/3177440.png'
              }
              alt={`${name ?? 'User'}'s profile`}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="absolute -bottom-1 -right-1">
            <VerificationBadge
              isVerified={!!isVerified}
              verificationType="college"
              size={18}
              className='text-success-foreground fill-success'
            />
          </div>
        </div>

        {/* Details */}
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <h3 className="text-lg font-semibold text-foreground">
              {name ?? 'Unknown User'}
            </h3>

            {rating ? (
              <div className="flex items-center space-x-1">
                <Icon
                  name="Star"
                  size={16}
                  className="text-warning fill-current"
                />
                <span className="text-sm font-medium text-foreground">
                  {rating}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({reviewCount ?? 0})
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">(New User)</span>
            )}
          </div>

          {/* Role tag */}
          <p className="text-xs font-medium text-accent uppercase tracking-wide mb-1">
            {role === 'driver' ? 'Driver' : 'Passenger'}
          </p>

          <p className="text-sm text-muted-foreground mb-2">
            {college ?? 'College not specified'}
            {year ? ` • ${year}` : ''}
          </p>

          {bio && <p className="text-sm text-foreground mb-2">{bio}</p>}

          <div className="flex items-center space-x-4 mt-3">
            {typeof totalRides !== 'undefined' && (
              <div className="flex items-center space-x-1">
                <Icon name="Bike" size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {totalRides} rides
                </span>
              </div>
            )}

            {joinedDate && (
              <div className="flex items-center space-x-1">
                <Icon name="Clock" size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Joined {joinedDate}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* Export wrapped in Error Boundary */
export default function ProfileInfoWithBoundary(props: ProfileInfoProps) {
  return (
    <ProfileInfoErrorBoundary>
      <ProfileInfo {...props} />
    </ProfileInfoErrorBoundary>
  );
}
