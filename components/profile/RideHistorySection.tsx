"use client";

import React, { useMemo, useState } from "react";
import Icon from "../AppIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import { MessageSquare, Receipt, Repeat, Star } from "lucide-react";
import { ProfileSectionSkeleton } from "./ProfileSkeletons";

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

const RideHistorySection: React.FC<RideHistorySectionProps> = ({
  rideHistory = [],
  isLoading = false,
  onRebook,
  onRateRide,
  isExpanded,
  onToggle,
}) => {
  const [filter, setFilter] = useState("all");

  const history = useMemo(
    () =>
      (rideHistory ?? []).map((item) => ({
        ...item,
        pickup: item.pickup || "Unknown pickup",
        drop: item.drop || "Unknown drop",
        role: item.role || "passenger",
        date: formatUtcToTodayOrDayMonth(item.date) || "N/A",
        time: formatTimeToAmPm(item.time) || "N/A",
        amount: Number(item.amount ?? 0),
        distance: Number(item.distance ?? 0),
        duration: item.duration || "N/A",
        status: item.status ?? "completed",
      })),
    [rideHistory],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return history;
    return history.filter((item) => item.status === filter || item.role.toLowerCase() === filter);
  }, [filter, history]);

  if (isLoading) {
    return <ProfileSectionSkeleton icon={<Icon name="History" size={20} className="text-primary" />} titleWidthClass="w-36" />;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Icon name="History" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Ride History</h3>
            <p className="text-xs text-muted-foreground">Completed and past ride activity.</p>
          </div>
          <Badge variant="secondary">{history.length}</Badge>
        </div>
        <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={20} className="text-muted-foreground" />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[2800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-4 border-t border-border/70 px-4 pb-5 pt-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="sm:w-[220px]">
                <SelectValue placeholder="Filter rides" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rides</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="driver">As driver</SelectItem>
                <SelectItem value="passenger">As passenger</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Receipts and support actions are visible but disabled.</p>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">No rides in this view</p>
              <p className="text-xs text-muted-foreground">Once rides are completed, they appear here.</p>
            </div>
          ) : (
            filtered.map((ride) => (
              <article key={ride.id} className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {ride.pickup} -&gt; {ride.drop}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ride.date} • {ride.time}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {ride.role}
                    </Badge>
                    <Badge
                      variant={
                        ride.status === "completed"
                          ? "secondary"
                          : ride.status === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {ride.status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{ride.distance} km</span>
                  <span>{ride.duration}</span>
                  <span>₹{ride.amount.toLocaleString("en-IN")}</span>
                  {ride.rating ? <span>Rating {ride.rating.toFixed(1)}</span> : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {onRebook && ride.status === "completed" ? (
                    <Button variant="outline" size="sm" onClick={() => onRebook(ride)}>
                      <Repeat className="size-4" />
                      Book Again
                    </Button>
                  ) : null}
                  {onRateRide && ride.status === "completed" && !ride.rating ? (
                    <Button variant="outline" size="sm" onClick={() => onRateRide(ride, 5)}>
                      <Star className="size-4" />
                      Rate
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" disabled title="Coming soon: receipt export.">
                    <Receipt className="size-4" />
                    Receipt
                  </Button>
                  <Button variant="ghost" size="sm" disabled title="Coming soon: ride support workflow.">
                    <MessageSquare className="size-4" />
                    Support
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default RideHistorySection;
