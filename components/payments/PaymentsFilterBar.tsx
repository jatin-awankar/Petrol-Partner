"use client";

import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentFilter } from "@/lib/payments/view-model";

type PaymentsFilterBarProps = {
  filter: PaymentFilter;
  onFilterChange: (filter: PaymentFilter) => void;
  query: string;
  onQueryChange: (value: string) => void;
  sortBy: "latest" | "amount_desc" | "amount_asc" | "due_first";
  onSortByChange: (sortBy: "latest" | "amount_desc" | "amount_asc" | "due_first") => void;
  onRefreshAll: () => void;
  refreshing: boolean;
};

export default function PaymentsFilterBar({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  sortBy,
  onSortByChange,
  onRefreshAll,
  refreshing,
}: PaymentsFilterBarProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={(value) => onFilterChange(value as PaymentFilter)}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger className="text-xs md:text-sm" value="all">
              All
            </TabsTrigger>
            <TabsTrigger className="text-xs md:text-sm" value="action_required">
              Action Required
            </TabsTrigger>
            <TabsTrigger className="text-xs md:text-sm" value="in_verification">
              In Verification
            </TabsTrigger>
            <TabsTrigger className="text-xs md:text-sm" value="settled">
              Settled
            </TabsTrigger>
            <TabsTrigger className="text-xs md:text-sm" value="failed">
              Failed
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshAll}
          disabled={refreshing}
          className="w-full md:w-auto"
        >
          {refreshing ? "Refreshing..." : "Refresh All"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by route or student name"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-ring"
          />
        </label>

        <label className="relative w-full md:w-56">
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <select
            value={sortBy}
            onChange={(event) => onSortByChange(event.target.value as typeof sortBy)}
            className="h-9 w-full appearance-none rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-ring"
          >
            <option value="latest">Latest</option>
            <option value="due_first">Due First</option>
            <option value="amount_desc">Amount: High to Low</option>
            <option value="amount_asc">Amount: Low to High</option>
          </select>
        </label>
      </div>
    </section>
  );
}
