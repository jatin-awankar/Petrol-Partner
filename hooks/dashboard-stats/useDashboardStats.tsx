"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export const useDashboardStats = () => {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchStats = async (showLoading = false) => {
      try {
        if (showLoading) setIsLoading(true);

        // ✅ Get Clerk JWT
        const token = await getToken();
        if (!token) throw new Error("No Clerk token found");

        const res = await fetch("/api/dashboard/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);

        const data: DashboardStats = await res.json();
        if (isMounted) setStats(data);
      } catch (err) {
        console.error("[useDashboardStats] Error fetching stats:", err);
        if (isMounted) setError(err as Error);
      } finally {
        if (showLoading && isMounted) setIsLoading(false);
      }
    };

    // Initial fetch with loading
    fetchStats(true);

    // Refresh every 100 seconds without loading animation
    const interval = setInterval(() => fetchStats(false), 100_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [getToken]);

  return { stats, isLoading, error };
};
