"use client";

import React, { useMemo } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";

// TypeScript interfaces
interface Statistics {
  totalRides?: number;
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
}

interface StatisticsSectionProps {
  statistics?: Statistics | null;
  isLoading?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

interface StatCardProps {
  icon: string;
  title: string;
  value?: React.ReactNode;
  subtitle?: string;
  color?: string;
  className?: string;
}

interface ProgressBarProps {
  label: string;
  current?: number;
  total?: number;
  color?: string;
}

// Default statistics
const DEFAULT_STATISTICS: Statistics = {
  totalRides: 0,
  totalDistance: 0,
  moneySaved: 0,
  averageRating: 0,
  totalRatings: 0,
  co2Saved: 0,
  fuelSaved: 0,
  treesEquivalent: 0,
  studentsHelped: 0,
  monthlyRides: 0,
  monthlySavings: 0,
  monthlyDistance: 0,
  monthlyCO2: 0,
  communityScore: 0,
  communityRank: 0,
};

// StatCard component
const StatCard: React.FC<StatCardProps> = ({
  icon,
  title,
  value,
  subtitle,
  color = "text-primary",
}) => (
  <div className="bg-muted/30 rounded-lg p-4">
    <div className="flex items-center space-x-3 mb-2">
      <Icon name={icon} size={20} className={color} />
      <h4 className="font-medium text-foreground">{title}</h4>
    </div>
    <p className="text-2xl font-bold text-foreground mb-1">
      {value ?? "--"}
    </p>
    {subtitle && (
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    )}
  </div>
);

// ProgressBar component
const ProgressBar: React.FC<ProgressBarProps> = ({
  label,
  current = 0,
  total = 100,
  color = "bg-primary",
}) => {
  const safeCurrent = current ?? 0;
  const safeTotal = total > 0 ? total : 100;
  const percentage = Math.min(Math.max((safeCurrent / safeTotal) * 100, 0), 100);

  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {safeCurrent.toLocaleString()}/{safeTotal.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={safeCurrent}
          aria-valuemin={0}
          aria-valuemax={safeTotal}
        />
      </div>
    </div>
  );
};

const StatisticsSection: React.FC<StatisticsSectionProps> = ({
  statistics,
  isLoading = false,
  isExpanded,
  onToggle,
}) => {
  // Safe statistics with defaults
  const safeStats = useMemo<Statistics>(() => {
    if (!statistics) return DEFAULT_STATISTICS;

    return {
      totalRides: statistics.totalRides ?? 0,
      totalDistance: statistics.totalDistance ?? 0,
      moneySaved: statistics.moneySaved ?? 0,
      averageRating: statistics.averageRating ?? 0,
      totalRatings: statistics.totalRatings ?? 0,
      co2Saved: statistics.co2Saved ?? 0,
      fuelSaved: statistics.fuelSaved ?? 0,
      treesEquivalent: statistics.treesEquivalent ?? 0,
      studentsHelped: statistics.studentsHelped ?? 0,
      monthlyRides: statistics.monthlyRides ?? 0,
      monthlySavings: statistics.monthlySavings ?? 0,
      monthlyDistance: statistics.monthlyDistance ?? 0,
      monthlyCO2: statistics.monthlyCO2 ?? 0,
      communityScore: statistics.communityScore ?? 0,
      communityRank: statistics.communityRank ?? 0,
    };
  }, [statistics]);

  // Format rating display
  const formatRating = useMemo(() => {
    if (!safeStats.averageRating || safeStats.averageRating === 0) return "-";
    return safeStats.averageRating.toFixed(1);
  }, [safeStats.averageRating]);

  // Calculate community score percentage
  const communityScorePercentage = useMemo(() => {
    const score = safeStats.communityScore ?? 0;
    return Math.min(Math.max((score / 1000) * 100, 0), 100);
  }, [safeStats.communityScore]);

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
            <Icon name="BarChart3" size={20} className="text-primary" />
            <Skeleton width={160} height={20} className="rounded" />
          </div>
          <Skeleton width={20} height={20} className="rounded" />
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border">
            <div className="pt-4 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-4">
                      <Skeleton
                        width="60%"
                        height="20px"
                        className="mb-3"
                      />
                      <Skeleton width="40%" height="28px" />
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
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center space-x-3">
          <Icon name="BarChart3" size={20} className="text-primary" />
          <h3 className="font-medium text-foreground">Statistics & Impact</h3>
        </div>
        <Icon
          name={isExpanded ? "ChevronUp" : "ChevronDown"}
          size={20}
          className="text-muted-foreground"
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
            {/* OVERVIEW */}
            <section>
              <h4 className="font-medium text-foreground mb-4">Overview</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon="Bike"
                  title="Total Rides"
                  value={safeStats.totalRides?.toLocaleString() || "0"}
                  subtitle="As driver & passenger"
                />
                <StatCard
                  icon="MapPin"
                  title="Distance Traveled"
                  value={`${safeStats.totalDistance?.toLocaleString() || 0} km`}
                  subtitle="Across all rides"
                  color="text-purple-500"
                />
                <StatCard
                  icon="IndianRupee"
                  title="Money Saved"
                  value={`₹${safeStats.moneySaved?.toLocaleString() || 0}`}
                  subtitle="Through ride sharing"
                  color="text-success"
                />
                <StatCard
                  icon="Star"
                  title="Average Rating"
                  value={formatRating}
                  subtitle={`Based on ${safeStats.totalRatings?.toLocaleString() || 0} ratings`}
                  color="text-warning"
                />
              </div>
            </section>

            {/* ENVIRONMENTAL IMPACT */}
            <section className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Environmental Impact
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  icon="Leaf"
                  title="CO₂ Saved"
                  value={`${safeStats.co2Saved?.toLocaleString() || 0} kg`}
                  subtitle="Carbon footprint reduced"
                  color="text-success"
                />
                <StatCard
                  icon="Fuel"
                  title="Fuel Saved"
                  value={`${safeStats.fuelSaved?.toLocaleString() || 0} L`}
                  subtitle="Through ride sharing"
                  color="text-error/50"
                />
                <StatCard
                  icon="TreePine"
                  title="Trees Equivalent"
                  value={safeStats.treesEquivalent?.toLocaleString() || "0"}
                  subtitle="Environmental contribution"
                  color="text-purple-400"
                />
              </div>
            </section>

            {/* ACHIEVEMENTS */}
            <section className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">Achievements</h4>
              <div className="space-y-3">
                <ProgressBar
                  label="Eco Warrior (Reduce 100kg CO₂)"
                  current={safeStats.co2Saved}
                  total={100}
                  color="bg-success"
                />
                <ProgressBar
                  label="Frequent Rider (Complete 50 rides)"
                  current={safeStats.totalRides}
                  total={50}
                  color="bg-primary"
                />
                <ProgressBar
                  label="Community Helper (Help 25 students)"
                  current={safeStats.studentsHelped}
                  total={25}
                  color="bg-indigo-400"
                />
                <ProgressBar
                  label="Distance Master (Travel 1000km)"
                  current={safeStats.totalDistance}
                  total={1000}
                  color="bg-warning"
                />
              </div>
            </section>

            {/* MONTHLY BREAKDOWN */}
            <section className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">This Month</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    icon: "Bike",
                    color: "text-primary",
                    label: "Rides",
                    value: safeStats.monthlyRides?.toLocaleString() || "0",
                  },
                  {
                    icon: "IndianRupee",
                    color: "text-indigo-400",
                    label: "Saved",
                    value: `₹${safeStats.monthlySavings?.toLocaleString() || 0}`,
                  },
                  {
                    icon: "MapPin",
                    color: "text-warning",
                    label: "km",
                    value: safeStats.monthlyDistance?.toLocaleString() || "0",
                  },
                  {
                    icon: "Leaf",
                    color: "text-success",
                    label: "kg CO₂",
                    value: safeStats.monthlyCO2?.toLocaleString() || "0",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="text-center p-3 bg-muted/30 rounded-lg"
                  >
                    <Icon
                      name={item.icon}
                      size={24}
                      className={`${item.color} mx-auto mb-2`}
                    />
                    <p className="text-lg font-semibold text-foreground">
                      {item.value}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* COMMUNITY CONTRIBUTION */}
            <section className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Community Contribution
              </h4>
              <div className="bg-gradient-to-r from-primary/10 to-warning/10 rounded-lg p-4 shadow-md">
                <div className="flex items-center space-x-3 mb-3">
                  <Icon name="Users" size={24} className="text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      Community Impact Score
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Based on your contributions to the college community
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-foreground">Impact Score</span>
                      <span className="text-yellow-500 font-medium">
                        {safeStats.communityScore?.toLocaleString() || 0}/1000
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-primary to-warning h-3 rounded-full transition-all duration-300"
                        style={{ width: `${communityScorePercentage}%` }}
                        role="progressbar"
                        aria-valuenow={safeStats.communityScore}
                        aria-valuemin={0}
                        aria-valuemax={1000}
                      />
                    </div>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-lg font-bold text-primary">
                      #{safeStats.communityRank?.toLocaleString() || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">College Rank</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticsSection;