"use client";
import React, { useState } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";

type StatCardProps = {
  icon: string;
  title: string;
  value?: React.ReactNode;
  subtitle?: string;
  color?: string;
  className?: string;
};

type ProgressBarProps = {
  label: string;
  current?: number;
  total?: number;
  color?: string;
};

type StatisticsSectionProps = {
  statistics: any;
  isExpanded: boolean;
  onToggle: () => void;
};

const StatisticsSection: React.FC<StatisticsSectionProps> = ({
  statistics,
  isExpanded,
  onToggle,
}) => {
  const [isLoading, setIsLoading] = useState(false);

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
      <p className="text-2xl font-bold text-foreground mb-1">{value ?? "--"}</p>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );

  const ProgressBar: React.FC<ProgressBarProps> = ({
    label,
    current = 0,
    total = 100,
    color = "bg-primary",
  }) => {
    const percentage = Math.min((current / total) * 100, 100);
    return (
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-foreground">{label}</span>
          <span className="text-muted-foreground">
            {current}/{total}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`${color} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton width="40%" height="20px" />
          <Skeleton width="20%" height="16px" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-4">
                <Skeleton width="60%" height="20px" className="mb-3" />
                <Skeleton width="40%" height="28px" />
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg mb-4 shadow-md">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
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

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="pt-4 space-y-6">
            {/* OVERVIEW */}
            <section>
              <h4 className="font-medium text-foreground mb-4">Overview</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon="Bike"
                  title="Total Rides"
                  value={statistics?.totalRides}
                  subtitle="As driver & passenger"
                />
                <StatCard
                  icon="MapPin"
                  title="Distance Traveled"
                  value={`${statistics?.totalDistance ?? 0} km`}
                  subtitle="Across all rides"
                  color="text-purple-500"
                />
                <StatCard
                  icon="IndianRupee"
                  title="Money Saved"
                  value={`₹${statistics?.moneySaved ?? 0}`}
                  subtitle="Through ride sharing"
                  color="text-success"
                />
                <StatCard
                  icon="Star"
                  title="Average Rating"
                  value={statistics?.averageRating ?? "-"}
                  subtitle={`Based on ${statistics?.totalRatings ?? 0} ratings`}
                  color="text-warning"
                  className="fill-current"
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
                  value={`${statistics?.co2Saved ?? 0} kg`}
                  subtitle="Carbon footprint reduced"
                  color="text-success"
                />
                <StatCard
                  icon="Fuel"
                  title="Fuel Saved"
                  value={`${statistics?.fuelSaved ?? 0} L`}
                  subtitle="Through ride sharing"
                  color="text-error/50"
                />
                <StatCard
                  icon="TreePine"
                  title="Trees Equivalent"
                  value={statistics?.treesEquivalent ?? 0}
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
                  current={statistics?.co2Saved}
                  total={100}
                  color="bg-success"
                />
                <ProgressBar
                  label="Frequent Rider (Complete 50 rides)"
                  current={statistics?.totalRides}
                  total={50}
                  color="bg-primary"
                />
                <ProgressBar
                  label="Community Helper (Help 25 students)"
                  current={statistics?.studentsHelped}
                  total={25}
                  color="bg-accent"
                />
                <ProgressBar
                  label="Distance Master (Travel 1000km)"
                  current={statistics?.totalDistance}
                  total={1000}
                  color="bg-warning"
                />
              </div>
            </section>

            {/* MONTHLY BREAKDOWN */}
            <section className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">This Month</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 ">
                {[
                  {
                    icon: "Bike",
                    color: "text-primary",
                    label: "Rides",
                    value: statistics?.monthlyRides,
                  },
                  {
                    icon: "IndianRupee",
                    color: "text-indigo-400",
                    label: "Saved",
                    value: `₹${statistics?.monthlySavings}`,
                  },
                  {
                    icon: "MapPin",
                    color: "text-warning",
                    label: "km",
                    value: statistics?.monthlyDistance,
                  },
                  {
                    icon: "Leaf",
                    color: "text-success",
                    label: "kg CO₂",
                    value: statistics?.monthlyCO2,
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
                      {item.value ?? "--"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* COMMUNITY CONTRIBUTION */}
            <section className="border-t border-border pt-6">
              <h4 className="font-medium text-foreground mb-4">
                Community Contribution
              </h4>
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-4 shadow-md">
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
                        {statistics?.communityScore ?? 0}/1000
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-primary to-accent h-3 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            (statistics?.communityScore / 1000) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">
                      #{statistics?.communityRank ?? "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      College Rank
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatisticsSection;
