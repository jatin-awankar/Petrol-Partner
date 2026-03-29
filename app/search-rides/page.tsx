import React from "react";
import SearchComponent from "@/components/searchRides/SearchComponent";
import SuggestedRides from "@/components/searchRides/SuggestedRides";
import NearbyRides from "@/components/searchRides/NearbyRides";
import { redirect } from "next/navigation";
import { getServerCurrentUser } from "@/lib/server-auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Icon from "@/components/AppIcon";

const SearchRidesPage = async () => {
  const user = await getServerCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen pb-16 md:pb-auto bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.10),_transparent_48%),radial-gradient(circle_at_85%_15%,_hsl(var(--accent)/0.18),_transparent_42%)]">
      <div className="page container mx-auto space-y-6">
        <section className="rounded-3xl border border-primary/20 p-5 md:p-7 bg-card/95 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Ride Discovery
              </p>
              <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-foreground">
                Find the right campus ride
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Search active offers and ride requests on your route, then book
                directly in a few taps.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-primary">
                  Live route feed
                </span>
                <span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-success">
                  Verified students
                </span>
                <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-foreground">
                  Fast booking
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild className="h-10 px-4">
                <Link href="/post-ride">
                  <Icon name="Plus" size={16} />
                  Post Ride
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-10 px-4">
                <Link href="/dashboard">
                  <Icon name="LayoutDashboard" size={16} />
                  Dashboard
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <SearchComponent />

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3">
            <NearbyRides />
          </div>
          <div className="xl:col-span-2">
            <SuggestedRides />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchRidesPage;
