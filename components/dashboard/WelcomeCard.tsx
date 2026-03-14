"use client";

import React from "react";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import { motion } from "framer-motion";

import Icon from "@/components/AppIcon";
import VerificationBadge from "../ui/VerificationBadge";
import { Button } from "../ui/button";
import { useUserProfile } from "@/hooks/auth/useUserProfile";

class WelcomeCardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("WelcomeCard Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Unable to load welcome data.
        </div>
      );
    }
    return this.props.children;
  }
}

const getGreeting = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const WelcomeCard = () => {
  const currentHour = new Date().getHours();
  const { profile, loading } = useUserProfile();
  const firstName = profile?.full_name?.trim().split(" ")[0] || "Student";

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-border/80 bg-gradient-hero p-6 shadow-soft"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Skeleton height={28} width="70%" className="mb-2" />
            <Skeleton height={18} width="45%" />
          </div>
          <div className="h-14 w-14 rounded-2xl bg-muted/60" />
        </div>
        <Skeleton height={18} width="100%" className="mt-4" />
      </motion.div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/80 bg-gradient-hero p-6 shadow-soft"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {getGreeting(currentHour)}
          </p>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
            {firstName}, your campus ride hub is ready.
          </h1>
          <p className="text-sm text-muted-foreground">
            Find or offer rides without switching roles. Your student profile keeps
            everything consistent.
          </p>
        </div>

        <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="GraduationCap" size={26} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1">
          <Icon name="MapPin" size={14} className="text-primary" />
          {profile?.college || "Your College"}
        </span>
        {profile?.is_verified && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1">
            <VerificationBadge
              isVerified={true}
              verificationType="college"
              size={16}
              showTooltip={true}
            />
            Verified student
          </span>
        )}
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1">
          <Icon name="Users" size={14} className="text-primary" />
          Campus rides active
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button asChild className="sm:w-auto">
          <Link href="/search-rides">
            <Icon name="Search" size={16} />
            Find a ride
          </Link>
        </Button>
        <Button asChild variant="outline" className="sm:w-auto">
          <Link href="/post-a-ride">
            <Icon name="CarFront" size={16} />
            Offer a ride
          </Link>
        </Button>
      </div>
    </motion.section>
  );
};

export default function WelcomeCardWithErrorBoundary() {
  return (
    <WelcomeCardErrorBoundary>
      <WelcomeCard />
    </WelcomeCardErrorBoundary>
  );
}
