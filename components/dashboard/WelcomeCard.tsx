// src/pages/dashboard-home/components/WelcomeCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import Icon from "@/components/AppIcon";
import Skeleton from "react-loading-skeleton";
import VerificationBadge from "../ui/VerificationBadge";

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
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 mb-6 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Skeleton height={30} width={`60%`} className="mb-1" />
            <Skeleton height={20} width={`40%`} className="mb-4" />
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
            <Icon name="" size={32} color="white" />
          </div>
        </div>
        <Skeleton height={20} width={`100%`} />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white mb-6 shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold mb-1">
            {getGreeting()}, {userName?.trim().split(" ")[0]}!
          </h1>
          <div className="flex items-center space-x-2">
            <span className="text-primary-foreground/80 text-sm">
              {collegeName}
              {"  "}
              {isVerified && (
                <VerificationBadge
                  isVerified={true}
                  verificationType="college"
                  size={16}
                  showTooltip={true}
                />
              )}
            </span>
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
