"use client";

import React, { useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { motion } from "framer-motion";

interface StatItem {
  id: string;
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative";
  icon: string;
  color: string;
  bgColor: string;
  description: string;
}

const StatsCard: React.FC = () => {
  const [stats, setStats] = useState<StatItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setStats([
        {
          id: "fuel-savings",
          title: "Fuel Saved",
          value: "₹2,450",
          change: "+12%",
          changeType: "positive",
          icon: "Fuel",
          color: "text-error",
          bgColor: "bg-error/10",
          description: "This month",
        },
        {
          id: "rides-completed",
          title: "Rides Completed",
          value: "23",
          change: "+5",
          changeType: "positive",
          icon: "Bike",
          color: "text-primary",
          bgColor: "bg-primary/10",
          description: "Total rides",
        },
        {
          id: "carbon-saved",
          title: "CO₂ Reduced",
          value: "45.2 kg",
          change: "+8.1 kg",
          changeType: "positive",
          icon: "Leaf",
          color: "text-success",
          bgColor: "bg-success/10",
          description: "This month",
        },
        {
          id: "rating",
          title: "Your Rating",
          value: "4.8",
          change: "+0.2",
          changeType: "positive",
          icon: "Star",
          color: "text-warning",
          bgColor: "bg-warning/10",
          description: "Out of 5.0",
        },
      ]);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-card border border-border rounded-xl p-6 mb-6 shadow-soft"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Your Stats</h2>
        {loading ? (
          <Skeleton width={20} height={20} />
        ) : (
          <Icon name="TrendingUp" size={20} className="text-success" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <Skeleton width={40} height={40} circle />
                <Skeleton width="70%" height={12} />
                <Skeleton width="90%" height={16} />
                <Skeleton width="60%" height={12} />
              </div>
            ))
          : stats?.map((stat) => (
              <div key={stat?.id} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-8 h-8 ${
                      stat?.bgColor ?? "bg-muted"
                    } rounded-lg flex items-center justify-center`}
                  >
                    <Icon
                      name={stat?.icon ?? "Info"}
                      size={14}
                      className={stat?.color ?? "text-foreground"}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {stat?.title ?? "-"}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-xl font-bold text-foreground">
                      {stat?.value ?? "-"}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        stat?.changeType === "positive"
                          ? "text-success"
                          : "text-error"
                      }`}
                    >
                      {stat?.change ?? ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stat?.description ?? ""}
                  </p>
                </div>
              </div>
            ))}
      </div>

      {/* Progress indicators */}
      <div className="mt-4 pt-4 border-t border-border">
        {loading ? (
          <div className="space-y-3">
            <Skeleton height={6} />
            <Skeleton height={6} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Monthly Goal</span>
                <span>76%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: "76%" }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Eco Impact</span>
                <span>89%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-success h-2 rounded-full"
                  style={{ width: "89%" }}
                ></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default StatsCard;
