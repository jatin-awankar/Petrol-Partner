"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
// import VerificationBadge from '../../../components/ui/VerificationBadge';
import { Button } from "../ui/button";
import { Search } from "lucide-react";
import Icon from "../AppIcon";

interface RideSuggestion {
  id: string;
  type: string;
  title: string;
  route: string;
  driver: string;
  time: string;
  price: string;
  seats: number;
  rating: number;
  isVerified: boolean;
  estimatedTime: string;
  reason: string;
}

const RideSuggestions: React.FC = () => {
  const [suggestions, setSuggestions] = useState<RideSuggestion[] | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching from API
    const timer = setTimeout(() => {
      setSuggestions([
        {
          id: "suggestion-1",
          type: "popular-route",
          title: "Popular Route Available",
          route: "Campus → Downtown Mall",
          driver: "Emma Wilson",
          time: "4:30 PM",
          price: "₹45",
          seats: 2,
          rating: 4.9,
          isVerified: true,
          estimatedTime: "25 min",
          reason: "Based on your frequent trips",
        },
        {
          id: "suggestion-2",
          type: "nearby",
          title: "Ride Near You",
          route: "Library → Train Station",
          driver: "David Chen",
          time: "6:15 PM",
          price: "₹60",
          seats: 1,
          rating: 4.7,
          isVerified: true,
          estimatedTime: "35 min",
          reason: "Leaving from your location",
        },
        {
          id: "suggestion-3",
          type: "regular",
          title: "Regular Commute Match",
          route: "Campus → Airport",
          driver: "Sarah Johnson",
          time: "Tomorrow, 8:00 AM",
          price: "₹120",
          seats: 3,
          rating: 5.0,
          isVerified: true,
          estimatedTime: "45 min",
          reason: "Matches your schedule",
        },
      ]);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const dismissSuggestion = (suggestionId: string) => {
    setDismissedSuggestions((prev) => [...prev, suggestionId]);
  };

  const visibleSuggestions = suggestions?.filter(
    (s) => !dismissedSuggestions.includes(s.id)
  );

  if (!loading && (!visibleSuggestions || visibleSuggestions.length === 0))
    return null;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Icon name="Zap" size={20} className="text-purple-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Suggested Rides
          </h2>
        </div>
        <Button variant="ghost" size="sm">
          Customize
        </Button>
      </div>

      <div className="space-y-4">
        {loading
          ? Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="border border-border rounded-lg p-4 animate-pulse"
              >
                <Skeleton width="100%" height={16} className="mb-2" />
                <Skeleton width="80%" height={12} className="mb-2" />
                <Skeleton width="90%" height={12} className="mb-2" />
                <Skeleton width="100%" height={20} />
              </div>
            ))
          : visibleSuggestions?.map((suggestion) => (
              <div
                key={suggestion.id}
                className="border border-border rounded-lg p-4 hover:shadow-soft transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-medium text-foreground">
                        {suggestion.title}
                      </h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {suggestion.reason}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                      <Icon
                        name="MapPin"
                        size={14}
                        className="text-green-600"
                      />
                      <span>{suggestion.route}</span>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Icon
                          name="Clock"
                          size={12}
                          className="text-indigo-400"
                        />
                        <span>{suggestion.time}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Icon
                          name="Users"
                          size={12}
                          className="text-blue-400"
                        />
                        <span>{suggestion.seats} seats</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Icon
                          name="Timer"
                          size={12}
                          className="text-yellow-500"
                        />
                        <span>{suggestion.estimatedTime}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissSuggestion(suggestion.id)}
                  >
                    <Icon name="X" size={14} />
                  </Button>
                </div>

                {/* Driver Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-400/10 rounded-full flex items-center justify-center">
                      <Icon name="User" size={14} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-foreground">
                          {suggestion.driver}
                        </span>
                        {/* {suggestion.isVerified && (
                          <VerificationBadge
                            isVerified={true}
                            verificationType="driver"
                            size="sm"
                            showTooltip={false}
                          />
                        )} */}
                      </div>
                      <div className="flex items-center space-x-1">
                        <Icon
                          name="Star"
                          size={12}
                          className="text-warning fill-current"
                        />
                        <span className="text-xs text-muted-foreground">
                          {suggestion.rating}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold text-foreground">
                      {suggestion.price}
                    </span>
                    <Button variant="default" size="sm">
                      Book Now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <Button variant="outline" className="w-full">
          <Search />
          Browse All Available Rides
        </Button>
      </div>
    </div>
  );
};

export default RideSuggestions;
