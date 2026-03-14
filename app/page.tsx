import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Clock3,
  MapPinned,
  MapPin,
  MessageCircle,
  Shield,
  UserCheck2,
  Users,
  CarFront,
  Wallet,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const quickStats = [
  { label: "Active campus groups", value: "140+" },
  { label: "Avg. seat match time", value: "6 min" },
  { label: "Cost saved per student", value: "up to 38%" },
];

const routeBoard = [
  {
    route: "Girls Hostel -> Main Gate",
    time: "8:10 AM",
    seats: "2 seats",
    fare: "INR 45",
  },
  {
    route: "Engineering Block -> Metro Hub",
    time: "5:35 PM",
    seats: "3 seats",
    fare: "INR 50",
  },
  {
    route: "City PG -> North Campus",
    time: "7:20 PM",
    seats: "1 seat",
    fare: "INR 65",
  },
];

const flowBlocks = [
  {
    title: "For Riders",
    icon: Users,
    steps: [
      "Set pickup and drop near your campus route.",
      "Compare fare, profile, and timing in one view.",
      "Reserve a seat and coordinate inside chat.",
    ],
    ctaLabel: "Search rides",
    href: "/search-rides",
  },
  {
    title: "For Drivers",
    icon: CarFront,
    steps: [
      "Post your commute with seats and pricing.",
      "Add ride preferences before requests come in.",
      "Confirm co-riders and publish confidently.",
    ],
    ctaLabel: "Post a ride",
    href: "/post-a-ride",
  },
];

const trustPoints = [
  {
    title: "Verified college profiles",
    description: "Ride only within authenticated student communities.",
    icon: UserCheck2,
  },
  {
    title: "Route-first matching",
    description: "Match by real pickup/drop patterns, not random city radius.",
    icon: MapPinned,
  },
  {
    title: "In-app coordination",
    description: "Pickup details, delays, and updates stay in chat threads.",
    icon: MessageCircle,
  },
  {
    title: "Transparent split pricing",
    description: "Clear per-seat fares before you request or accept.",
    icon: Wallet,
  },
];

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-hero opacity-60" />

      <section className="page relative z-10 py-8 md:py-12">
        <div className="rounded-3xl border border-border/80 bg-card/80 p-6 shadow-soft backdrop-blur-sm md:p-10">
          <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles size={14} />
                Built for college commute patterns
              </span>

              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
                  Campus rides that feel safer, faster, and fair on cost.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                  Petrol Partner helps college students coordinate daily travel
                  with verified peers, structured ride posts, and transparent
                  cost sharing.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 px-6">
                  <Link href="/search-rides">
                    Find a ride
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" className="h-11 px-6" variant="secondary">
                  <Link href="/post-a-ride">Post your ride</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-6">
                  <Link href="/register">Create account</Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {quickStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-border bg-background/80 p-4"
                  >
                    <p className="text-xl font-semibold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-2xl border border-border/90 bg-background/85 p-5 shadow-card md:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Live near-campus routes
                </p>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                  Updated now
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {routeBoard.map((item) => (
                  <div
                    key={item.route}
                    className="rounded-xl border border-border bg-card/80 p-3.5"
                  >
                    <h2 className="text-sm font-semibold text-foreground">{item.route}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                        <Clock3 size={12} />
                        {item.time}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                        <Users size={12} />
                        {item.seats}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
                        {item.fare}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Typical commute paths: hostels, PG hubs, metro exits, and
                  college gates.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="page relative z-10 pt-0 pb-8">
        <div className="grid gap-4 lg:grid-cols-2">
          {flowBlocks.map((block) => (
            <div
              key={block.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <block.icon size={18} />
                </span>
                <h2 className="text-lg font-semibold text-foreground">{block.title}</h2>
              </div>

              <div className="space-y-2.5">
                {block.steps.map((step, index) => (
                  <div key={step} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <p className="text-muted-foreground">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={block.href}>
                    {block.ctaLabel}
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="page relative z-10 pt-0 pb-10 md:pb-14">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {trustPoints.map((point) => (
            <div
              key={point.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-card"
            >
              <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
                <point.icon size={16} />
              </div>
              <h3 className="text-base font-semibold text-foreground">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="page relative z-10 pb-12 md:pb-16">
        <div className="rounded-3xl border border-border/90 bg-card px-6 py-8 shadow-soft md:px-10 md:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <MapPin size={14} />
                Start with your college route
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Ready to make daily commute less expensive and less stressful?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                Join Petrol Partner, set your route once, and coordinate every
                ride with your student community.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-6">
                <Link href="/register">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-6">
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 border-t border-border pt-5 text-sm md:grid-cols-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 size={16} className="text-success" />
              Verified student ecosystem
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield size={16} className="text-success" />
              Safety-first preference controls
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock size={16} className="text-success" />
              Faster daily ride coordination
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
