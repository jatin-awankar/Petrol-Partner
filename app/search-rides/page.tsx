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
    <div className="page min-h-screen bg-background">
      <div className="container mx-auto px-4 pb-12 pt-5 space-y-6">
        <section className="rounded-3xl border border-border/70 bg-card p-5 md:p-7 shadow-card">
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
