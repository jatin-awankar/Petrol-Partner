"use client";

import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RideCard from "./RideCard";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useFetchRideOffers } from "@/hooks/rides/useRideOffers";
import { useFetchRideRequests } from "@/hooks/rides/useRideRequests";

const PAGE_SIZE = 6;

type SortMode = "soonest" | "price_low" | "price_high";

const SearchComponent = () => {
  const router = useRouter();
  const { offers, loading: offerLoading } = useFetchRideOffers();
  const { requests, loading: requestLoading } = useFetchRideRequests();

  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [college, setCollege] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [tab, setTab] = useState<RideType>("offer");
  const [sortMode, setSortMode] = useState<SortMode>("soonest");
  const [page, setPage] = useState(1);

  const offersData = (offers?.rides ?? []) as RideOfferData[];
  const requestsData = (requests?.rides ?? []) as RideRequestData[];
  const currentData = tab === "offer" ? offersData : requestsData;
  const loading = tab === "offer" ? offerLoading : requestLoading;

  const filtered = useMemo(() => {
    const searchPickup = pickup.trim().toLowerCase();
    const searchDropoff = dropoff.trim().toLowerCase();
    const searchCollege = college.trim().toLowerCase();
    const maxPriceNumber = Number(maxPrice);
    const hasPriceFilter = Number.isFinite(maxPriceNumber) && maxPriceNumber > 0;

    return currentData
      .filter((ride) => {
        if (
          searchPickup &&
          !ride.pickup_location?.toLowerCase().includes(searchPickup) &&
          !ride.drop_location?.toLowerCase().includes(searchPickup)
        ) {
          return false;
        }

        if (
          searchDropoff &&
          !ride.drop_location?.toLowerCase().includes(searchDropoff) &&
          !ride.pickup_location?.toLowerCase().includes(searchDropoff)
        ) {
          return false;
        }

        if (
          searchCollege &&
          !ride.college?.toLowerCase().includes(searchCollege)
        ) {
          return false;
        }

        if (hasPriceFilter && Number(ride.price_per_seat ?? 0) > maxPriceNumber) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortMode === "price_low") {
          return Number(a.price_per_seat ?? 0) - Number(b.price_per_seat ?? 0);
        }

        if (sortMode === "price_high") {
          return Number(b.price_per_seat ?? 0) - Number(a.price_per_seat ?? 0);
        }

        const aDate = new Date(`${a.date}T${a.time}`).getTime();
        const bDate = new Date(`${b.date}T${b.time}`).getTime();
        return aDate - bDate;
      });
  }, [currentData, pickup, dropoff, college, maxPrice, sortMode]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const resetFilters = () => {
    setPickup("");
    setDropoff("");
    setCollege("");
    setMaxPrice("");
    setSortMode("soonest");
    setPage(1);
  };

  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 md:p-5 shadow-card">
      <div className="rounded-2xl border border-border/60 bg-muted/35 p-4 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4">
            <Label className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Pickup
            </Label>
            <Input
              placeholder="Start point"
              value={pickup}
              onChange={(e) => {
                setPickup(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="lg:col-span-4">
            <Label className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Dropoff
            </Label>
            <Input
              placeholder="Destination"
              value={dropoff}
              onChange={(e) => {
                setDropoff(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="lg:col-span-4">
            <Label className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              College
            </Label>
            <Input
              placeholder="Campus name"
              value={college}
              onChange={(e) => {
                setCollege(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="lg:col-span-3">
            <Label className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Max Price
            </Label>
            <Input
              placeholder="e.g. 120"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="lg:col-span-3">
            <Label className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Sort
            </Label>
            <Select
              value={sortMode}
              onValueChange={(value: SortMode) => {
                setSortMode(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="soonest">Soonest departure</SelectItem>
                <SelectItem value="price_low">Price: Low to high</SelectItem>
                <SelectItem value="price_high">Price: High to low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-6 flex items-end gap-2">
            <Button
              className="h-10 px-4"
              onClick={() => setPage(1)}
              type="button"
            >
              <Icon name="Search" size={16} />
              Search
            </Button>
            <Button
              variant="outline"
              className="h-10 px-4"
              onClick={resetFilters}
              type="button"
            >
              <Icon name="RotateCcw" size={16} />
              Reset
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          setTab(value as RideType);
          setPage(1);
        }}
        className="mt-4"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="grid w-full md:w-[360px] grid-cols-2">
            <TabsTrigger value="offer" className="tabs-trigger">
              Ride offers ({offersData.length})
            </TabsTrigger>
            <TabsTrigger value="request" className="tabs-trigger">
              Ride requests ({requestsData.length})
            </TabsTrigger>
          </TabsList>

          <div className="text-xs md:text-sm text-muted-foreground">
            {filtered.length} matching result{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        <TabsContent value="offer" className="mt-4">
          <RideResults
            loading={loading}
            filtered={filtered}
            paged={paged}
            onOpenRide={handleOpenRide}
          />
        </TabsContent>

        <TabsContent value="request" className="mt-4">
          <RideResults
            loading={loading}
            filtered={filtered}
            paged={paged}
            onOpenRide={handleOpenRide}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-5 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <Icon name="ChevronLeft" size={16} />
        </Button>
        <div className="text-sm text-muted-foreground">Page {page}</div>
        <Button
          variant="outline"
          disabled={page * PAGE_SIZE >= filtered.length}
          onClick={() => setPage((p) => p + 1)}
        >
          <Icon name="ChevronRight" size={16} />
        </Button>
      </div>
    </section>
  );
};

const RideResults = ({
  loading,
  filtered,
  paged,
  onOpenRide,
}: {
  loading: boolean;
  filtered: CombineRideData[];
  paged: CombineRideData[];
  onOpenRide: (ride: CombineRideData) => void;
}) => {
  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading live rides...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No rides found. Try broadening your route or removing a filter.
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {paged.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              onClick={onOpenRide}
              loading={loading}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SearchComponent;
