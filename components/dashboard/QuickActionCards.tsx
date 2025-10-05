"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bike, Search } from "lucide-react";
import { safeValue } from "./DashboardStats";
import { useDashboardStats } from "@/hooks/dashboard-stats/useDashboardStats";

interface Action {
  id: string;
  title: string;
  description: string;
  icon: React.ReactElement;
  color: string;
  textColor: string;
  route: string;
  stats: string;
}

const QuickActionCards = () => {
  const router = useRouter();
  const { stats, isLoading } = useDashboardStats();

  const actions: Action[] = [
    {
      id: "find-ride",
      title: "Find a Ride",
      description: "Search for available rides",
      icon: <Search size={24} color="white" />,
      color: "bg-green-500",
      textColor: "text-green-50",
      route: "/ride-details-booking",
      stats: safeValue(stats?.totalActiveRides) + " rides Available",
    },
    {
      id: "offer-ride",
      title: "Offer a Ride",
      description: "Share your journey",
      icon: <Bike size={24} color="white" />,
      color: "bg-blue-500",
      textColor: "text-blue-50",
      route: "/post-a-ride",
      stats: "Earn ₹10-100/ride",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        Loading...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {actions.map((action) => (
        <div
          key={action.id}
          role="button"
          aria-label={action.title}
          className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => router.push(action.route)}
        >
          <div className="flex items-start justify-between mb-4">
            <div
              className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center`}
            >
              {action.icon}
            </div>
            <ArrowRight size={20} className="text-muted-foreground" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-1">
            {action.title}
          </h3>
          <p className="text-muted-foreground text-sm mb-3">
            {action.description}
          </p>

          <div className="flex lg:flex-col items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {action.stats}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(action.route);
              }}
            >
              Get Started
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuickActionCards;
