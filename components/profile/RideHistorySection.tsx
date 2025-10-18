"use client";

import React, { useState, useEffect } from "react";
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

interface RideHistoryProps {
  id: string;
  role: string;
  pickup: string;
  drop: string;
  date: string;
  time: string;
  status: "completed" | "cancelled" | "ongoing";
  distance: number;
  duration: "25 min";
  amount: number;
  rating: number;
  partner: {
    name: "Arjun Patel";
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop&crop=face";
  };
}

const RideHistorySection: React.FC<{
  rideHistory: RideHistoryProps[];
  onRebook: (ride: RideHistoryProps) => void;
  onRateRide: (ride: RideHistoryProps, rating: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ rideHistory, onRebook, onRateRide, isExpanded, onToggle }) => {
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [isLoading, setIsLoading] = useState(true);

  const filterOptions = [
    { value: "all", label: "All Rides" },
    { value: "driver", label: "As Driver" },
    { value: "passenger", label: "As Passenger" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const sortOptions = [
    { value: "recent", label: "Most Recent" },
    { value: "oldest", label: "Oldest First" },
    { value: "rating", label: "Highest Rated" },
    { value: "distance", label: "Longest Distance" },
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-success bg-success/10";
      case "cancelled":
        return "text-error bg-error/10";
      case "in-progress":
        return "text-primary bg-primary/10";
      default:
        return "text-muted-foreground bg-muted/10";
    }
  };

  const getRoleIcon = (role: string) => (role === "driver" ? "Car" : "User");

  const filteredAndSortedHistory = rideHistory
    ?.filter((ride) => {
      if (filterType === "all") return true;
      if (filterType === "driver" || filterType === "passenger")
        return ride?.role === filterType;
      return ride?.status === filterType;
    })
    ?.sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "oldest":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "rating":
          return (b?.rating || 0) - (a?.rating || 0);
        case "distance":
          return b?.distance - a?.distance;
        default:
          return 0;
      }
    });

  // 🔸 Skeleton loader
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card animate-pulse">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon name="History" size={20} className="text-primary" />
            <Skeleton
              width={160}
              height={20}
              className="rounded animate-bounce"
            />
          </div>
          <Skeleton width={20} height={20} className="rounded animate-bounce" />
        </button>
        {isExpanded && (
          <>
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton width="50%" height={40} className="animate-pulse" />
              <Skeleton width="50%" height={40} className="animate-pulse" />
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
          </>
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
      >
        <div className="flex items-center space-x-3">
          <Icon name="History" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Ride History</h3>
          <span className="bg-yellow-500/10 text-yellow-600 text-xs px-2 py-1 rounded-full">
            {rideHistory?.length} rides
          </span>
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
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0 "
        }`}
      >
        <div className="px-4 pb-4 border-t border-border">
          <div className="pt-4 space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Label>Filter by</Label>
              <Select
                value={filterType || ""}
                onValueChange={(value) => setFilterType(value)}
              >
                <SelectTrigger className="flex-1 w-full">
                  <SelectValue placeholder="Select Ride" />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label>Sort by</Label>
              <Select
                value={sortBy || ""}
                onValueChange={(value) => setSortBy(value)}
              >
                <SelectTrigger className="flex-1 w-full">
                  <SelectValue placeholder="Select Gender" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ride List */}
            {filteredAndSortedHistory?.length > 0 ? (
              <div className="space-y-4">
                {filteredAndSortedHistory?.map((ride) => (
                  <div
                    key={ride?.id}
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
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <Icon
                                name={getRoleIcon(ride?.role)}
                                size={16}
                                className="text-muted-foreground"
                              />
                              <span className="text-sm font-medium capitalize text-foreground">
                                {ride?.role}
                              </span>
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${getStatusColor(
                                  ride?.status
                                )}`}
                              >
                                {ride?.status}
                              </span>
                            </div>
                            <p className="font-medium text-foreground">
                              {ride?.pickup}
                            </p>
                            <p className="font-medium text-foreground">
                              {ride?.drop}
                            </p>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <p>{ride?.date}</p>
                            <p>{ride?.time}</p>
                          </div>
                        </div>

                        {/* Partner */}
                        {ride?.partner && (
                          <div className="flex items-center space-x-3 mb-3 p-2 bg-muted/30 rounded-lg">
                            <div className="w-8 h-8 rounded-full overflow-hidden">
                              <Image
                                src={ride?.partner?.avatar}
                                alt={ride?.partner?.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {ride?.role === "driver"
                                  ? "Passenger"
                                  : "Driver"}
                                : {ride?.partner?.name}
                              </p>
                              {ride?.rating && (
                                <div className="flex items-center space-x-1">
                                  <Icon
                                    name="Star"
                                    size={12}
                                    className="text-warning fill-current"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {ride?.rating}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Stats */}
                        <div className="flex flex-wrap items-center justify-between text-sm text-muted-foreground mb-3 gap-3">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                              <Icon name="MapPin" size={14} />
                              <span>{ride?.distance} km</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Icon name="Clock" size={14} />
                              <span>{ride?.duration}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Icon name="IndianRupee" size={14} />
                              <span>{ride?.amount}</span>
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
                          {ride?.status === "completed" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onRebook?.(ride)}
                              >
                                <Repeat />
                                Book Again
                              </Button>
                              {!ride?.rating && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    onRateRide?.(ride, ride.rating)
                                  }
                                >
                                  <Star />
                                  Rate Ride
                                </Button>
                              )}
                            </>
                          )}
                          <Button variant="ghost" size="sm">
                            <Receipt className="text-green-600" />
                            Receipt
                          </Button>
                          <Button variant="ghost" size="sm" className="hover:">
                            <MessageSquare className="text-indigo-400 fill-current" />
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
                <p className="text-muted-foreground mb-2">No rides found</p>
                <p className="text-sm text-muted-foreground">
                  {filterType !== "all"
                    ? "Try adjusting your filters"
                    : "Start your first ride to see history here"}
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
