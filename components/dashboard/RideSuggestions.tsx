"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Clock,
  MapPin,
  Search,
  Star,
  Timer,
  Users,
  User,
  X,
  Zap,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useRideOffers } from "@/hooks/dashboard-rides/useRideOffers";

interface Suggestion {
  id: string;
  title: string;
  route: string;
  driver: {
    full_name: string;
    avatar_url?: string;
    is_verified?: boolean;
    avg_rating: number;
  };
  time: string;
  price: number;
  seats: number;
  status?: string;
  estimated_time: string;
  reason: string;
}

const RideSuggestions = () => {
  const router = useRouter();
  const { rides } = useRideOffers();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const mapped: Suggestion[] =
          rides
            ?.filter(
              (ride: Ride) =>
                ride.status === "active" &&
                new Date(ride.departure_time) > new Date()
            )
            .map((ride: Ride) => ({
              id: ride.id,
              title: "Suggested Ride",
              route: `${ride.from_location} → ${ride.to_location}`,
              driver: {
                full_name: ride.driver?.full_name ?? "Unknown Driver",
                avatar_url: ride.driver?.avatar_url,
                is_verified: ride.driver?.is_verified ?? false,
                avg_rating: ride.driver?.avg_rating ?? 0,
              },
              time: new Date(ride.departure_time).toLocaleString(),
              price: ride.price_per_seat,
              seats: ride.available_seats,
              status: ride.status,
              estimated_time: "30 min",
              reason: "Based on your activity",
            })) ?? [];

        setSuggestions(mapped);
      } catch (err) {
        console.error("Error fetching suggestions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [rides]);

  const visibleSuggestions = suggestions
    ?.filter((offer) => !dismissedSuggestions.includes(offer.id))
    ?.slice(0, 3);

  const dismissSuggestion = (suggestionId: string) => {
    setDismissedSuggestions((prev) => [...prev, suggestionId]);
  };

  // Polished skeleton card
  const renderSkeleton = () => {
    return Array(3)
      .fill(0)
      .map((_, idx) => (
        <div
          key={idx}
          className="border border-border rounded-lg p-4 animate-pulse space-y-3 mb-3"
        >
          {/* Title & reason badge */}
          <div className="flex items-center justify-between mb-2">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-3/4 bg-muted rounded"></div>
              <div className="h-3 w-1/4 bg-muted rounded"></div>
            </div>
            <div className="h-6 w-16 bg-muted rounded animate-pulse"></div>
          </div>

          {/* Route */}
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <div className="w-4 h-4 bg-muted rounded-full"></div>
            <div className="h-3 w-1/2 bg-muted rounded"></div>
          </div>

          {/* Time, seats, estimated time */}
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <div className="h-3 w-10 bg-muted rounded"></div>
            <div className="h-3 w-10 bg-muted rounded"></div>
            <div className="h-3 w-12 bg-muted rounded"></div>
          </div>

          {/* Driver info */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"></div>
              <div className="space-y-1">
                <div className="h-3 w-24 bg-muted rounded animate-pulse"></div>
                <div className="h-2 w-10 bg-muted rounded animate-pulse"></div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="h-4 w-12 bg-muted rounded animate-pulse"></div>
              <div className="h-6 w-20 bg-muted rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      ));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Zap size={20} className="text-accent" />
          <h2 className="text-lg font-semibold text-foreground">
            Suggested Rides
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/settings/preferences")}
        >
          Customize
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">{renderSkeleton()}</div>
      ) : visibleSuggestions.length === 0 ? null : (
        <div className="space-y-4">
          {visibleSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="border border-border rounded-lg p-4 hover:shadow-soft transition-shadow"
            >
              {/* Ride Info */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-sm font-medium text-foreground">
                      {suggestion.title}
                    </h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {suggestion.reason}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                    <MapPin size={14} />
                    <span>{suggestion.route}</span>
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Clock size={12} />
                      <span>{suggestion.time}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users size={12} />
                      <span>{suggestion.seats} seats</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Timer size={12} />
                      <span>{suggestion.estimated_time}</span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissSuggestion(suggestion.id);
                  }}
                >
                  <X size={14} />
                </Button>
              </div>

              {/* Driver Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                    {suggestion.driver.avatar_url ? (
                      <Image
                        src={suggestion.driver.avatar_url}
                        alt={suggestion.driver.full_name}
                        width={32}
                        height={32}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <User size={14} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-foreground">
                        {suggestion.driver.full_name}
                      </span>
                      {suggestion.driver.is_verified ? (
                        <ShieldCheck size="16" />
                      ) : (
                        <ShieldAlert size="16" />
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <Star
                        size={12}
                        color="#fbbf24"
                        className="fill-yellow-400"
                      />
                      <span className="text-xs text-muted-foreground">
                        {suggestion.driver.avg_rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-lg font-bold text-foreground">
                    ₹{suggestion.price}
                  </span>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => router.push(`/rides/${suggestion.id}`)}
                  >
                    Book Now
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Browse All */}
      <div className="mt-4 pt-4 border-t border-border">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/rides")}
        >
          <Search size={16} className="mr-2" />
          Browse All Available Rides
        </Button>
      </div>
    </div>
  );
};

export default RideSuggestions;
