"use client";

import React from "react";
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

const DEFAULT_STATS: StatItem[] = [
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
];

type StatsCardProps = {
  stats?: StatItem[];
};

const StatsCard: React.FC<StatsCardProps> = ({ stats = DEFAULT_STATS }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-card border border-border rounded-xl p-6 mb-6 shadow-soft"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Your Stats</h2>
        <Icon name="TrendingUp" size={20} className="text-success" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.id} className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                <Icon name={stat.icon} size={14} className={stat.color} />
              </div>
              <span className="text-xs text-muted-foreground">{stat.title}</span>
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-bold text-foreground">{stat.value}</span>
                <span
                  className={`text-xs font-medium ${
                    stat.changeType === "positive" ? "text-success" : "text-error"
                  }`}
                >
                  {stat.change}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default StatsCard;
