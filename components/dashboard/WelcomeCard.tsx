// src/pages/dashboard-home/components/WelcomeCard.tsx
'use client';

import React, { useState, useEffect } from "react";
import Icon from "@/components/AppIcon";
// import VerificationBadge from '@/components/ui/VerificationBadge';
import Skeleton from "react-loading-skeleton";

// Error Boundary for this component
class WelcomeCardErrorBoundary extends React.Component<
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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("WelcomeCard Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-100 text-red-800 p-4 rounded-xl">
          Something went wrong loading the Welcome Card.
        </div>
      );
    }
    return this.props.children;
  }
}

// Props interface
interface WelcomeCardProps {
  userName?: string | null;
  collegeName?: string | null;
  isVerified?: boolean;
  activeStudents?: number;
  campusArea?: string;
}

const WelcomeCard: React.FC<WelcomeCardProps> = ({
  userName = "Student",
  collegeName = "Your College",
  isVerified = false,
  activeStudents = 0,
  campusArea = "Campus Area",
}) => {
  const [currentHour, setCurrentHour] = useState<number>(new Date().getHours());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const getGreeting = () => {
    if (currentHour < 12) return "Good morning";
    if (currentHour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white mb-6">
        <Skeleton height={30} width={`60%`} className="mb-2" />
        <Skeleton height={20} width={`40%`} className="mb-4" />
        <Skeleton height={60} width={`100%`} />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white mb-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold mb-1">
            {getGreeting()}, {userName}!
          </h1>
          <div className="flex items-center space-x-2">
            <p className="text-primary-foreground/80 text-sm">{collegeName}</p>
            {/* {isVerified && (
              <VerificationBadge
                isVerified={true}
                verificationType="college"
                size="sm"
                showTooltip={false}
              />
            )} */}
          </div>
        </div>
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
          <Icon name="GraduationCap" size={32} color="white" />
        </div>
      </div>

      <div className="mt-4 flex items-center space-x-4 text-sm">
        <div className="flex items-center space-x-1">
          <Icon name="MapPin" size={16} />
          <span>{campusArea}</span>
        </div>
        <div className="flex items-center space-x-1">
          <Icon name="Users" size={16} />
          <span>{activeStudents.toLocaleString()} active students</span>
        </div>
      </div>
    </div>
  );
};

// Export wrapped with error boundary
export default function WelcomeCardWithErrorBoundary(props: WelcomeCardProps) {
  return (
    <WelcomeCardErrorBoundary>
      <WelcomeCard {...props} />
    </WelcomeCardErrorBoundary>
  );
}
