"use client";

import {
  Users,
  Calendar,
  Activity,
  Car,
  DollarSign,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardStats } from "@/hooks/dashboard-stats/useDashboardStats";
import { motion } from "framer-motion";

export const safeValue = (val: number | undefined, isMoney = false) => {
  if (val == null || isNaN(val)) return isMoney ? "0.00" : "0";
  return isMoney ? val.toFixed(2) : val.toString();
};

const DashboardStats = () => {
  const { stats, loading: statsLoading } = useDashboardStats();


  const cards = [
    {
      label: "Total Users",
      value: safeValue(stats?.totalUsers),
      icon: <Users className="w-5 h-5 text-primary" />,
      iconBg: "bg-primary/10",
      color: "text-primary",
    },
    {
      label: "Total Booked Rides",
      value: safeValue(stats?.totalBookedRides),
      icon: <Calendar className="w-5 h-5 text-blue-500" />,
      iconBg: "bg-blue-500/10",
      color: "text-blue-500",
    },
    {
      label: "Daily Rides",
      value: safeValue(stats?.dailyRides),
      icon: <Activity className="w-5 h-5 text-orange-500" />,
      iconBg: "bg-orange-500/10",
      color: "text-orange-500",
    },
    // {
    //   label: "Active Rides",
    //   value: safeValue(stats?.totalActiveRides),
    //   icon: <Car className="w-5 h-5 text-emerald-600" />,
    //   iconBg: "bg-emerald-600/10",
    //   color: "text-emerald-600",
    // },
    {
      label: "Total Offers",
      value: safeValue(stats?.totalRideOffers),
      icon: <Car className="w-5 h-5 text-emerald-600" />,
      iconBg: "bg-emerald-600/10",
      color: "text-emerald-600",
    },
    {
      label: "Total Requests",
      value: safeValue(stats?.totalRideRequests),
      icon: <ClipboardList className="w-5 h-5 text-purple-600" />,
      iconBg: "bg-purple-600/10",
      color: "text-purple-600",
    },
    {
      label: "Total Revenue",
      value: `₹${safeValue(stats?.totalRevenue, true)}`,
      icon: <DollarSign className="w-5 h-5 text-emerald-600" />,
      iconBg: "bg-emerald-600/10",
      color: "text-emerald-600",
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-1 gap-4"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.1 },
        },
      }}
    >
      {cards.map((card) => (
        <motion.div
          key={card.label}
          variants={{
            hidden: { opacity: 0, scale: 0.9, y: 20 },
            visible: { opacity: 1, scale: 1, y: 0 },
          }}
          whileHover={{
            scale: 1.03,
            boxShadow: "0px 6px 20px rgba(0,0,0,0.12)",
          }}
          transition={{ duration: 0.3 }}
        >
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${card.iconBg}`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>
                    {statsLoading ? "..." : card.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default DashboardStats;
