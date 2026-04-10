"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock3, Search, Star, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { useFetchSuggestedRides } from "@/hooks/rides/useFetchSuggestedRides";
import { formatTimeToAmPm, todaysDate } from "@/lib/utils";
import { Button } from "../ui/button";
import { SkeletonBlock } from "./DashboardSkeletons";

const RideSuggestions: React.FC = () => {
  const router = useRouter();
  const { rideOffers, rideRequests, loading } = useFetchSuggestedRides({
    limit: 3,
    date: todaysDate.toISOString(),
  });

  const suggestions = useMemo(() => {
    const offers = rideOffers?.rides ?? [];
    const requests = rideRequests?.rides ?? [];
    return [...offers, ...requests].slice(0, 5);
  }, [rideOffers?.rides, rideRequests?.rides]);

  if (!loading && suggestions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Search className="size-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">
            Suggested rides nearby
          </h2>
        </div>

        <Button asChild variant="outline" size="sm" className="h-8 rounded-md">
          <Link href="/search-rides">Browse all</Link>
        </Button>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-36 rounded-xl border border-border/70" />
            ))
          : suggestions.map((ride: CombineRideData) => {
              const rideType = ride.driver_id ? "Offer" : "Request";
              const seatCount =
                ride.available_seats ?? ride.seats_required ?? 1;
              const rating = Number(ride.avg_rating ?? 0).toFixed(1);
              const avatar = ride.profile_image;

              return (
                <article
                  key={ride.id}
                  className="rounded-xl border border-border/70 bg-background p-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {rideType}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      ? {ride.price_per_seat}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-1 text-sm font-semibold text-foreground">
                    {ride.pickup_location} ? {ride.drop_location}
                  </p>

                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3.5" />
                      {formatTimeToAmPm(ride.time)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" />
                      {seatCount} seat{seatCount > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative size-8 overflow-hidden rounded-full border border-border bg-muted">
                        {avatar ? (
                          <Image
                            src={avatar}
                            alt={ride.full_name}
                            fill
                            sizes="32px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {ride.full_name}
                        </p>
                        <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Star className="size-3 fill-current text-amber-500" />
                          {Number.isNaN(Number(rating)) ? "N/A" : rating}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="h-8 rounded-md"
                      onClick={() => router.push(`/search-rides/${ride.id}`)}
                    >
                      View
                      <ArrowRight className="ml-1 size-3.5" />
                    </Button>
                  </div>
                </article>
              );
            })}
      </div>
    </section>
  );
};

export default RideSuggestions;

