"use client";

import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetHeader,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RideCard from "./RideCard";
import { useEffect, useMemo, useState } from "react";
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

export const sleep = (ms = 600) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------- Page ----------------------------------- */
const PAGE_SIZE = 6;

const SearchComponent = () => {
  const router = useRouter();

  // data
  const [offersData, setOffersData] = useState<RideOfferData[]>([]);
  const [requestsData, setRequestsData] = useState<RideRequestData[]>([]);

  // search + filters
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [tab, setTab] = useState<RideType>("offer");
  const [filters, setFilters] = useState({
    gender: "",
    college: "",
    ageFrom: "",
    ageTo: "",
  });

  const { offers, loading: offerLoading } = useFetchRideOffers();
  const { requests, loading: requestLoading } = useFetchRideRequests();

  // pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    const offerArr = offers?.rides ?? [];
    const requestArr = requests?.rides ?? [];
    setOffersData(offerArr);
    setRequestsData(requestArr);
  }, [offers, requests]);

  /* -------------------------- Derived data ----------------------------- */
  const currentData = tab === "offer" ? offersData : requestsData;

  const filtered = useMemo(() => {
    const arr = currentData;

    return arr.filter((r) => {
      // gender filter
      // if (filters.gender) {
      //   const person = r.type === "offer" ? r.driver : r.passenger;
      //   if (!person?.gender || person.gender !== filters.gender) return false;
      // }
      // college filter
      if (filters.college) {
        // const person = r.type === "offer" ? r.driver : r.passenger;
        if (
          !r?.college ||
          !r.college.toLowerCase().includes(filters.college.toLowerCase())
        )
          return false;
      }
      // age filter (range)
      // const from = filters.ageFrom ? Number(filters.ageFrom) : undefined;
      // const to = filters.ageTo ? Number(filters.ageTo) : undefined;
      // if (
      //   (from || to) &&
      //   (r.type === "offer" ? r.driver?.age : r.passenger?.age)
      // ) {
      //   const age =
      //     (r.type === "offer" ? r.driver?.age : r.passenger?.age) ?? 0;
      //   if (from && age < from) return false;
      //   if (to && age > to) return false;
      // }
      // search by pickup/dropoff text
      if (
        !r.pickup_location?.toLowerCase().includes(pickup.toLowerCase()) &&
        !r.drop_location?.toLowerCase().includes(pickup.toLowerCase())
      )
        return false;
      if (
        !r.drop_location?.toLowerCase().includes(dropoff.toLowerCase()) &&
        !r.pickup_location?.toLowerCase().includes(dropoff.toLowerCase())
      )
        return false;

      return true;
    });
  }, [currentData, filters.college, pickup, dropoff]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  //---------------------------- handlers ------------------------------//
  const handleOpenRide = (ride: CombineRideData) => {
    router.push(`/search-rides/${ride.id}`);
  };

  const handleClearFilters = () => {
    setFilters({ gender: "", college: "", ageFrom: "", ageTo: "" });
  };

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
            <Input
              placeholder="Pickup (e.g. College Gate)"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
            <Input
              placeholder="Dropoff (e.g. City Mall)"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setPage(1);
                }}
                className="w-full"
              >
                <Icon name="Search" /> Search
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Icon name="SlidersHorizontal" /> Filters
                </Button>
              </SheetTrigger>
              <SheetContent className="mt-16 animate-in fade-in-0 slide-in-from-right">
                <SheetHeader>
                  <SheetTitle>Apply Filters</SheetTitle>
                  <SheetDescription>Search more accurately</SheetDescription>
                </SheetHeader>
                <div className="grid flex-1 auto-rows-min gap-6 px-4">
                  <div className="grid gap-3">
                    <Label className="text-sm font-medium">Gender</Label>
                    <Select
                      value={filters.gender}
                      onValueChange={(value: string) =>
                        setFilters({ ...filters, gender: value })
                      }
                    >
                      <SelectTrigger className="w-full p-2 rounded-md border border-primary bg-background">
                        <SelectValue placeholder="Select Gender (Default-Any)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3">
                    <Label className="text-sm font-medium">College</Label>
                    <Input
                      placeholder="College name"
                      value={filters.college}
                      onChange={(e) =>
                        setFilters({ ...filters, college: e.target.value })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-3">
                      <Label className="text-sm font-medium">Age from</Label>
                      <Input
                        placeholder="18"
                        value={filters.ageFrom}
                        onChange={(e) =>
                          setFilters({ ...filters, ageFrom: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label className="text-sm font-medium">Age to</Label>
                      <Input
                        placeholder="30"
                        value={filters.ageTo}
                        onChange={(e) =>
                          setFilters({ ...filters, ageTo: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <Button variant="ghost" onClick={handleClearFilters}>
                      Clear
                    </Button>
                    <SheetClose asChild>
                      <Button
                        type="submit"
                        onClick={() => {
                          setPage(1); /* apply filters */
                        }}
                      >
                        Apply
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Button
              variant="ghost"
              onClick={() => {
                setPickup("");
                setDropoff("");
                handleClearFilters();
              }}
            >
              <Icon name="X" /> Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-soft mb-6">
        <Tabs
          value={tab}
          onValueChange={(v: string) => {
            setTab(v as RideType);
            setPage(1);
          }}
        >
          <div className="flex flex-col md:flex-row gap-2 items-center justify-between mb-4">
            <TabsList className="flex gap-2 w-full md:w-fit px-1">
              <TabsTrigger
                value="offer"
                className="tabs-trigger flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer"
              >
                <Icon name="Bike" /> Ride Offers
              </TabsTrigger>
              <TabsTrigger
                value="request"
                className="tabs-trigger flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer"
              >
                <Icon name="User" /> Ride Requests
              </TabsTrigger>
            </TabsList>
            <div className="text-sm text-muted-foreground">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          <TabsContent value="offer">
            <AnimatePresence mode="wait">
              {offerLoading && requestLoading ? (
                <div className="py-8 text-center text-muted-foreground">
                  Loading rides data...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No rides found — try removing filters or widening the search.
                </div>
              ) : (
                <motion.div
                  layout
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {paged.map((r) => (
                    <RideCard
                      key={r.id}
                      ride={r}
                      onClick={handleOpenRide}
                      loading={offerLoading && requestLoading}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="request">
            <AnimatePresence mode="wait">
              {!offerLoading && !requestLoading && filtered.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No requests found — try removing filters or widening the
                  search.
                </div>
              ) : (
                <motion.div
                  layout
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {paged.map((r) => (
                    <RideCard
                      key={r.id}
                      ride={r}
                      onClick={handleOpenRide}
                      loading={offerLoading && requestLoading}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <Icon name="ChevronLeft" />
          </Button>
          <div className="text-sm text-muted-foreground">Page {page}</div>
          <Button
            variant="outline"
            disabled={page * PAGE_SIZE >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            <Icon name="ChevronRight" />
          </Button>
        </div>
      </div>
    </>
  );
};

export default SearchComponent;
