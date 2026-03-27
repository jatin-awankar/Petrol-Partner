"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Bike, Search, Wallet } from "lucide-react";

import { useFetchRideOffers } from "@/hooks/rides/useRideOffers";
import { useFetchRideRequests } from "@/hooks/rides/useRideRequests";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";
import { Button } from "../ui/button";

const QuickActionCards: React.FC = () => {
  const { offers } = useFetchRideOffers();
  const { requests } = useFetchRideRequests();
  const { bookingsData } = useFetchBookings(20);

  const openMarketCount =
    (offers?.totalCount ?? 0) + (requests?.totalCount ?? 0);
  const activeBookings =
    bookingsData?.bookings?.filter((item) =>
      ["pending", "confirmed"].includes(item.status),
    ).length ?? 0;

  const cards = [
    {
      id: "find-rides",
      title: "Find rides on your route",
      description: "Browse live offers and requests near your pickup corridor.",
      metricLabel: "Live market",
      metricValue: `${openMarketCount} listings`,
      href: "/search-rides",
      icon: Search,
      accentClass: "from-emerald-50 to-green-100",
    },
    {
      id: "post-ride",
      title: "Post ride offer or request",
      description:
        "Create a new trip in seconds and wait for matching students.",
      metricLabel: "Your active bookings",
      metricValue: `${activeBookings} active`,
      href: "/post-a-ride",
      icon: Bike,
      accentClass: "from-amber-50 to-orange-100",
    },
    {
      id: "payments",
      title: "Track post-trip payments",
      description:
        "Monitor due, overdue, and completed settlements in one place.",
      metricLabel: "Finance hub",
      metricValue: "Settlement board",
      href: "/payment-transactions",
      icon: Wallet,
      accentClass: "from-sky-50 to-blue-100",
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.id}
          className={`rounded-2xl border border-border/70 bg-gradient-to-br ${card.accentClass} p-5 shadow-card`}
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg border border-border/70 p-2 text-primary">
              <card.icon className="size-5" />
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {card.metricLabel}
            </span>
          </div>

          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-800/90">
            {card.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {card.description}
          </p>

          <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
            <span className="text-sm font-semibold text-slate-800/90">
              {card.metricValue}
            </span>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 rounded-md px-2.5"
            >
              <Link
                href={card.href}
                className="inline-flex items-center gap-1 text-slate-800/90"
              >
                Open
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
};

export default QuickActionCards;
