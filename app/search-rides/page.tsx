import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, Search, Sparkles } from "lucide-react";

import SearchComponent from "@/components/searchRides/SearchComponent";
import SuggestedRides from "@/components/searchRides/SuggestedRides";
import NearbyRides from "@/components/searchRides/NearbyRides";
import { authOptions } from "@/lib/authOptions";

const SearchRidesPage = async () => {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <main className="page min-h-screen bg-background pb-20 md:pb-6 space-y-5">
      <section className="rounded-3xl border border-border/80 bg-gradient-hero p-4 shadow-soft md:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/75 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles size={13} />
              Find a campus ride
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays size={13} />
              {dateLabel}
            </p>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Search rides around your campus routes.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Filter by pickup, drop, or college and jump into a verified ride.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
              <MapPin size={13} />
              Hostel, gate, metro, or landmark
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
              <Search size={13} />
              Browse offers and requests
            </div>
          </div>
        </div>
      </section>

      <NearbyRides />
      <SearchComponent />
      <SuggestedRides />
    </main>
  );
};

export default SearchRidesPage;
