"use client";

import React, { useState, useMemo, useCallback } from "react";
import Icon from "@/components/AppIcon";
import Image from "@/components/AppImage";
import Skeleton from "react-loading-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";
import { MessageSquare, Receipt, Repeat, Star } from "lucide-react";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";

// Proper TypeScript interfaces
interface RidePartner {
  name: string;
  avatar: string;
}

interface RideHistoryItem {
  id: string;
  role: string;
  pickup: string;
  drop: string;
  date: string;
  time: string;
  status: "completed" | "cancelled" | "ongoing";
  distance: number;
  duration: string;
  amount: number;
  rating?: number;
  partner?: RidePartner;
}

interface RideHistorySectionProps {
  rideHistory?: RideHistoryItem[];
  isLoading?: boolean;
  onRebook?: (ride: RideHistoryItem) => void;
  onRateRide?: (ride: RideHistoryItem, rating: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

// Default partner avatar
const DEFAULT_AVATAR =
  "https://w7.pngwing.com/pngs/81/570/png-transparent-profile-logo-computer-icons-user-user-blue-heroes-logo.png";

// Filter and sort options
const FILTER_OPTIONS = [
  { value: "all", label: "All Rides" },
  { value: "driver", label: "As Driver" },
  { value: "passenger", label: "As Passenger" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "oldest", label: "Oldest First" },
  { value: "rating", label: "Highest Rated" },
  { value: "distance", label: "Longest Distance" },
] as const;

const RideHistorySection: React.FC<RideHistorySectionProps> = ({
  rideHistory = [],
  isLoading = false,
  onRebook,
  onRateRide,
  isExpanded,
  onToggle,
}) => {
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");

  // Helper function to safely convert to number
  const toNumber = (value: any, defaultValue: number = 0): number => {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
  };

  // Safe data access with defaults
  const safeRideHistory = useMemo(() => {
    if (!rideHistory || !Array.isArray(rideHistory)) return [];
    return rideHistory.map((ride) => ({
      ...ride,
      id: ride?.id || "",
      role: ride?.role || "passenger",
      pickup: ride?.pickup || "Unknown location",
      drop: ride?.drop || "Unknown location",
      date: formatUtcToTodayOrDayMonth(ride?.date) || new Date().toISOString().split("T")[0],
      time: formatTimeToAmPm(ride?.time) || "12:00 PM",
      status: (ride?.status?.toLowerCase() || "completed") as
        | "completed"
        | "cancelled"
        | "ongoing",
      distance: toNumber(ride?.distance, 0),
      duration: ride?.duration || "N/A",
      amount: toNumber(ride?.amount, 0),
      rating: ride?.rating !== undefined && ride?.rating !== null 
        ? toNumber(ride?.rating, 0) 
        : undefined,
      partner: ride?.partner
        ? {
            name: ride.partner.name || "Unknown",
            avatar: ride.partner.avatar || DEFAULT_AVATAR,
          }
        : {
            name: "Unknown",
            avatar: DEFAULT_AVATAR,
          },
    }));
  }, [rideHistory]);

  // Status color helper
  const getStatusColor = useCallback((status: string): string => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "text-success bg-success/10";
      case "cancelled":
        return "text-error bg-error/10";
      case "ongoing":
      case "in-progress":
        return "text-primary bg-primary/10";
      default:
        return "text-muted-foreground bg-muted/10";
    }
  }, []);

  // Role icon helper
  const getRoleIcon = useCallback(
    (role: string): string => (role?.toLowerCase() === "driver" ? "Car" : "User"),
    []
  );

  // Filter and sort rides
  const filteredAndSortedHistory = useMemo(() => {
    if (!safeRideHistory || safeRideHistory.length === 0) return [];

    const filtered = safeRideHistory.filter((ride) => {
      if (filterType === "all") return true;
      if (filterType === "driver" || filterType === "passenger") {
        return ride.role?.toLowerCase() === filterType;
      }
      return ride.status?.toLowerCase() === filterType;
    });

    const sorted = [...filtered].sort((a, b) => {
      try {
        switch (sortBy) {
          case "recent":
            return (
              new Date(b.date).getTime() - new Date(a.date).getTime()
            );
          case "oldest":
            return (
              new Date(a.date).getTime() - new Date(b.date).getTime()
            );
          case "rating":
            return (b.rating || 0) - (a.rating || 0);
          case "distance":
            return b.distance - a.distance;
          default:
            return 0;
        }
      } catch (error) {
        console.error("Error sorting rides:", error);
        return 0;
      }
    });

    return sorted;
  }, [safeRideHistory, filterType, sortBy]);

  // Handlers
  const handleRebook = useCallback(
    (ride: RideHistoryItem) => {
      if (onRebook) {
        try {
          onRebook(ride);
          toast.success("Redirecting to booking...");
        } catch (error) {
          console.error("Error rebooking ride:", error);
          toast.error("Failed to rebook ride");
        }
      }
    },
    [onRebook]
  );

  const handleRateRide = useCallback(
    (ride: RideHistoryItem, rating: number) => {
      if (onRateRide) {
        try {
          onRateRide(ride, rating);
          toast.success("Rating submitted!");
        } catch (error) {
          console.error("Error rating ride:", error);
          toast.error("Failed to submit rating");
        }
      }
    },
    [onRateRide]
  );

  const handleReceipt = useCallback(() => {
    toast.info("Receipt feature coming soon!");
  }, []);

  const handleSupport = useCallback(() => {
    toast.info("Support feature coming soon!");
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card">
        <button
          onClick={onToggle}
          disabled
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-wait"
        >
          <div className="flex items-center space-x-3">
            <Icon name="History" size={20} className="text-primary" />
            <Skeleton width={160} height={20} className="rounded" />
          </div>
          <Skeleton width={20} height={20} className="rounded" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border">
            <div className="pt-4 space-y-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <Skeleton width="50%" height={40} />
                <Skeleton width="50%" height={40} />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-lg p-4 space-y-3"
                  >
                    <Skeleton width="25%" height={16} />
                    <Skeleton width="33.33%" height={16} />
                    <Skeleton width="66.66%" height={16} />
                    <Skeleton width="100%" height={40} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-card">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center space-x-3">
          <Icon name="History" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Ride History</h3>
          {safeRideHistory.length > 0 && (
            <span className="bg-yellow-500/10 text-yellow-600 text-xs px-2 py-1 rounded-full">
              {safeRideHistory.length} {safeRideHistory.length === 1 ? "ride" : "rides"}
            </span>
          )}
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground transition-transform duration-200"
        />
      </button>

      {/* Content */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 border-t border-border">
          <div className="pt-4 space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <Label className="whitespace-nowrap">Filter by:</Label>
              <Select
                value={filterType || "all"}
                onValueChange={(value) => setFilterType(value)}
              >
                <SelectTrigger className="flex-1 w-full">
                  <SelectValue placeholder="Filter rides" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label className="whitespace-nowrap">Sort by:</Label>
              <Select
                value={sortBy || "recent"}
                onValueChange={(value) => setSortBy(value)}
              >
                <SelectTrigger className="flex-1 w-full">
                  <SelectValue placeholder="Sort rides" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ride List */}
            {filteredAndSortedHistory.length > 0 ? (
              <div className="space-y-4">
                {filteredAndSortedHistory.map((ride) => (
                  <div
                    key={ride.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition"
                  >
                    <div className="flex items-start space-x-4">
                      {/* Route Line */}
                      <div className="flex flex-col items-center shrink-0 pt-1">
                        <div className="w-3 h-3 bg-success rounded-full" />
                        <div className="w-0.5 h-8 bg-border my-1" />
                        <div className="w-3 h-3 bg-error rounded-full" />
                      </div>

                      {/* Ride Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2 gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1 flex-wrap">
                              <Icon
                                name={getRoleIcon(ride.role)}
                                size={16}
                                className="text-muted-foreground shrink-0"
                              />
                              <span className="text-sm font-medium capitalize text-foreground">
                                {ride.role || "Passenger"}
                              </span>
                              <span
                                className={`text-xs px-2 py-1 rounded-full shrink-0 ${getStatusColor(
                                  ride.status
                                )}`}
                              >
                                {ride.status || "Unknown"}
                              </span>
                            </div>
                            <p className="font-medium text-foreground truncate">
                              {ride.pickup}
                            </p>
                            <p className="font-medium text-foreground truncate">
                              {ride.drop}
                            </p>
                          </div>
                          <div className="text-right text-sm text-muted-foreground shrink-0">
                            <p>{ride.date || "N/A"}</p>
                            <p>{ride.time || "N/A"}</p>
                          </div>
                        </div>

                        {/* Partner */}
                        {ride.partner && (
                          <div className="flex items-center space-x-3 mb-3 p-2 bg-muted/30 rounded-lg">
                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                              <Image
                                src={ride.partner.avatar || DEFAULT_AVATAR}
                                alt={ride.partner.name || "Partner"}
                                className="w-full h-full object-cover"
                                fallbackSrc={DEFAULT_AVATAR}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {ride.role?.toLowerCase() === "driver"
                                  ? "Passenger"
                                  : "Driver"}
                                : {ride.partner.name || "Unknown"}
                              </p>
                              {ride.rating !== undefined && ride.rating > 0 && (
                                <div className="flex items-center space-x-1">
                                  <Icon
                                    name="Star"
                                    size={12}
                                    className="text-warning fill-current"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {Number(ride.rating || 0).toFixed(1)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Icon name="MapPin" size={14} />
                            <span>{ride.distance} km</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="Clock" size={14} />
                            <span>{ride.duration}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="IndianRupee" size={14} />
                            <span>
                              {Number(ride.amount || 0).toFixed(2)}
                            </span>
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
                          {ride.status === "completed" && (
                            <>
                              {onRebook && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRebook(ride)}
                                >
                                  <Repeat size={14} />
                                  Book Again
                                </Button>
                              )}
                              {onRateRide &&
                                (!ride.rating || ride.rating === 0) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRateRide(ride, 5)}
                                  >
                                    <Star size={14} />
                                    Rate Ride
                                  </Button>
                                )}
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleReceipt}
                          >
                            <Receipt size={14} className="text-green-600" />
                            Receipt
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSupport}
                          >
                            <MessageSquare
                              size={14}
                              className="text-indigo-400 fill-current"
                            />
                            Support
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Icon
                  name="Bike"
                  size={48}
                  className="text-muted-foreground mx-auto mb-3"
                />
                <p className="text-muted-foreground mb-2 font-medium">
                  No rides found
                </p>
                <p className="text-sm text-muted-foreground">
                  {filterType !== "all"
                    ? "Try adjusting your filters to see more rides"
                    : safeRideHistory.length === 0
                    ? "Start your first ride to see history here"
                    : "No rides match your current filter"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RideHistorySection;