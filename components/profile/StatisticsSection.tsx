"use client";

import React, { useMemo } from "react";
import Icon from "../AppIcon";
import { Badge } from "../ui/badge";
import { ProfileSectionSkeleton } from "./ProfileSkeletons";

interface Statistics {
  totalRides?: number;
  completedRides?: number;
  cancelledRides?: number;
  completionRate?: number;
  totalDistance?: number;
  moneySaved?: number;
  averageRating?: number;
  totalRatings?: number;
  co2Saved?: number;
  fuelSaved?: number;
  treesEquivalent?: number;
  studentsHelped?: number;
  monthlyRides?: number;
  monthlySavings?: number;
  monthlyDistance?: number;
  monthlyCO2?: number;
  communityScore?: number;
  communityRank?: number;
  communityPercentile?: number;
  rankingTier?: string;
  nextTier?: string;
  pointsToNextTier?: number;
  scoreBreakdown?: {
    reliability?: number;
    rideVolume?: number;
    monthlyMomentum?: number;
    ratingQuality?: number;
    communityImpact?: number;
  };
}

interface StatisticsSectionProps {
  statistics?: Statistics | null;
  isLoading?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

const StatisticsSection: React.FC<StatisticsSectionProps> = ({
  statistics,
  isLoading = false,
  isExpanded,
  onToggle,
}) => {
  const stats = useMemo(
    () => ({
      totalRides: statistics?.totalRides ?? 0,
      completedRides: statistics?.completedRides ?? 0,
      cancelledRides: statistics?.cancelledRides ?? 0,
      completionRate: statistics?.completionRate ?? 0,
      totalDistance: statistics?.totalDistance ?? 0,
      moneySaved: statistics?.moneySaved ?? 0,
      averageRating: statistics?.averageRating ?? 0,
      totalRatings: statistics?.totalRatings ?? 0,
      co2Saved: statistics?.co2Saved ?? 0,
      fuelSaved: statistics?.fuelSaved ?? 0,
      treesEquivalent: statistics?.treesEquivalent ?? 0,
      studentsHelped: statistics?.studentsHelped ?? 0,
      monthlyRides: statistics?.monthlyRides ?? 0,
      monthlySavings: statistics?.monthlySavings ?? 0,
      monthlyDistance: statistics?.monthlyDistance ?? 0,
      monthlyCO2: statistics?.monthlyCO2 ?? 0,
      communityScore: statistics?.communityScore ?? 0,
      communityRank: statistics?.communityRank ?? 0,
      communityPercentile: statistics?.communityPercentile ?? 0,
      rankingTier: statistics?.rankingTier ?? "Starter",
      nextTier: statistics?.nextTier ?? "Active",
      pointsToNextTier: statistics?.pointsToNextTier ?? 0,
      scoreBreakdown: {
        reliability: statistics?.scoreBreakdown?.reliability ?? 0,
        rideVolume: statistics?.scoreBreakdown?.rideVolume ?? 0,
        monthlyMomentum: statistics?.scoreBreakdown?.monthlyMomentum ?? 0,
        ratingQuality: statistics?.scoreBreakdown?.ratingQuality ?? 0,
        communityImpact: statistics?.scoreBreakdown?.communityImpact ?? 0,
      },
    }),
    [statistics],
  );

  if (isLoading) {
    return <ProfileSectionSkeleton icon={<Icon name="BarChart3" size={20} className="text-primary" />} titleWidthClass="w-36" />;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 shadow-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Icon name="BarChart3" size={20} className="text-primary" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Impact Stats</h3>
            <p className="text-xs text-muted-foreground">
              Competitive scoring based on consistency, trust, and impact.
            </p>
          </div>
          <Badge variant="outline">Leaderboard mode</Badge>
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground"
        />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-4 border-t border-border/70 px-4 pb-5 pt-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 via-card/95 to-card p-3">
              <p className="text-xs text-muted-foreground">Total rides</p>
              <p className="text-xl font-semibold text-foreground">
                {stats.totalRides.toLocaleString("en-IN")}
              </p>
            </article>
            <article className="rounded-xl border border-sky-300/20 bg-gradient-to-br from-sky-300/20 via-card/95 to-card p-3">
              <p className="text-xs text-muted-foreground">Distance</p>
              <p className="text-xl font-semibold text-foreground">
                {stats.totalDistance.toLocaleString("en-IN")} km
              </p>
            </article>
            <article className="rounded-xl border border-success/20 bg-gradient-to-br from-success/20 via-card/95 to-card p-3">
              <p className="text-xs text-muted-foreground">Money saved</p>
              <p className="text-xl font-semibold text-foreground">
                INR {stats.moneySaved.toLocaleString("en-IN")}
              </p>
            </article>
            <article className="rounded-xl border border-warning/20 bg-gradient-to-br from-warning/20 via-card/95 to-card p-3 dark:from-amber-500/10">
              <p className="text-xs text-muted-foreground">Average rating</p>
              <p className="text-xl font-semibold text-foreground">
                {stats.averageRating ? stats.averageRating.toFixed(1) : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.totalRatings} ratings
              </p>
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-success/20 bg-gradient-to-br from-success/20 via-card/95 to-card p-3 dark:from-emerald-500/10">
              <h4 className="text-sm font-semibold text-foreground">
                Environmental Impact
              </h4>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p>CO2 saved: {stats.co2Saved.toLocaleString("en-IN")} kg</p>
                <p>Fuel saved: {stats.fuelSaved.toLocaleString("en-IN")} L</p>
                <p>Trees equivalent: {stats.treesEquivalent.toLocaleString("en-IN")}</p>
              </div>
            </article>
            <article className="rounded-xl border border-indigo-300/30 bg-gradient-to-br from-indigo/20 via-card/95 to-card p-3 dark:from-indigo-500/10">
              <h4 className="text-sm font-semibold text-foreground">This Month</h4>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p>Rides: {stats.monthlyRides.toLocaleString("en-IN")}</p>
                <p>Savings: INR {stats.monthlySavings.toLocaleString("en-IN")}</p>
                <p>Distance: {stats.monthlyDistance.toLocaleString("en-IN")} km</p>
                <p>CO2 saved: {stats.monthlyCO2.toLocaleString("en-IN")} kg</p>
              </div>
            </article>
          </div>

          <article className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 via-card/95 to-card p-3">
            <h4 className="text-sm font-semibold text-foreground">Campus Leaderboard</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Tier {stats.rankingTier} • Score {stats.communityScore.toLocaleString("en-IN")} /
              1000 • Rank #
              {stats.communityRank > 0 ? stats.communityRank.toLocaleString("en-IN") : "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Top {stats.communityPercentile}% this cycle
              {stats.pointsToNextTier > 0
                ? ` • ${stats.pointsToNextTier} pts to ${stats.nextTier}`
                : " • Highest tier reached"}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${Math.min(100, (stats.communityScore / 1000) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p className="text-xs text-muted-foreground">
                Completion rate: {stats.completionRate.toLocaleString("en-IN")}%
              </p>
              <p className="text-xs text-muted-foreground">
                Completed rides: {stats.completedRides.toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">
                Cancelled rides: {stats.cancelledRides.toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">
                Students helped: {stats.studentsHelped.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="mt-3 space-y-2">
              {[
                { label: "Reliability", value: stats.scoreBreakdown.reliability, max: 250 },
                { label: "Ride volume", value: stats.scoreBreakdown.rideVolume, max: 300 },
                {
                  label: "Monthly momentum",
                  value: stats.scoreBreakdown.monthlyMomentum,
                  max: 180,
                },
                { label: "Rating quality", value: stats.scoreBreakdown.ratingQuality, max: 170 },
                {
                  label: "Community impact",
                  value: stats.scoreBreakdown.communityImpact,
                  max: 100,
                },
              ].map((metric) => (
                <div key={metric.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{metric.label}</span>
                    <span>
                      {metric.value}/{metric.max}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary/80 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (metric.value / metric.max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};

export default StatisticsSection;
