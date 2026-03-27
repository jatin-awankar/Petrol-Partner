"use client";

import Link from "next/link";
import { CalendarClock, CarFront, ShieldCheck } from "lucide-react";

import { useUserProfile } from "@/hooks/auth/useUserProfile";
import { Button } from "../ui/button";

const WelcomeCard = () => {
  const { profile, loading } = useUserProfile();
  const currentHour = new Date().getHours();

  // if (error) return <p className="text-red-500">{error}</p>

  const getGreeting = () => {
    if (currentHour < 12) return "Good morning";
    if (currentHour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-sky-50 via-card to-blue-50 p-6 shadow-card md:p-7">
        <div className="h-7 w-48 animate-pulse rounded-md bg-slate-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-slate-200" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
        </div>
        <div className="mt-5 h-9 w-40 animate-pulse rounded-md bg-slate-200" />
      </section>
    );
  }

  const firstName = profile?.full_name?.trim().split(" ")[0] || "Rider";

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-accent via-card/50 to-accent p-6 shadow-card md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semiboald uppercase tracking-[0.12em] text-primary">
            Campus commute control center
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan, post, and manage rides for today in one place.
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-right">
          <p className="text-xs text-muted-foreground">Account</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {profile?.is_verified ? "Verified student" : "Verification pending"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-border/70 bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-xs uppercase tracking-[0.08em]">Status</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {profile?.is_verified
              ? "Ready for ride posting"
              : "Complete verification flow"}
          </p>
        </article>

        <article className="rounded-xl border border-border/70 bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CarFront className="size-4 text-primary" />
            <span className="text-xs uppercase tracking-[0.08em]">Mode</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">
            Offer rides or request seats as needed
          </p>
        </article>

        <article className="rounded-xl border border-border/70 bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="size-4 text-primary" />
            <span className="text-xs uppercase tracking-[0.08em]">Campus</span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">
            {profile?.college || "Add your college details in profile settings"}
          </p>
        </article>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild size="sm" className="h-9 rounded-md">
          <Link href="/search-rides">Find Available Rides</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-9 rounded-md">
          <Link href="/post-a-ride">Post Ride Offer or Request</Link>
        </Button>
      </div>
    </section>
  );
};

export default WelcomeCard;
