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
import RideCard, { Ride, RideType } from "./RideCard";
import { Card } from "../ui/card";
import Skeleton from "react-loading-skeleton";
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

/* --------------------------- Small helpers ----------------------------- */
export const sleep = (ms = 600) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------- Page ----------------------------------- */
const PAGE_SIZE = 6;

const SearchComponent = () => {
  const router = useRouter();

  // data
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

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

  // pagination
  const [page, setPage] = useState(1);

  /* --------------------- mock fetch main rides ------------------------- */
  useEffect(() => {
    const cancelled = false;
    (async () => {
      setLoading(true);
      await sleep(700);
      if (cancelled) return;

      // mock variety of offers/requests
      const sample: Ride[] = [
        {
          id: "r1",
          type: "offer",
          pickup: "Main Gate - College",
          dropoff: "City Mall",
          time: "09:30 AM",
          date: "Today",
          price: "₹60",
          seatsAvailable: 3,
          driver: {
            id: "d1",
            name: "Rahul Sharma",
            gender: "male",
            college: "NIT",
            age: 24,
          },
          distanceKm: 10.5,
          duration: "20m",
        },
        {
          id: "r2",
          type: "request",
          pickup: "Hostel Block B",
          dropoff: "Central Station",
          time: "10:15 AM",
          passenger: {
            id: "p1",
            name: "Priya Verma",
            gender: "female",
            college: "IIT",
            age: 21,
          },
          date: "Today",
        },
        {
          id: "r3",
          type: "offer",
          pickup: "Library",
          dropoff: "Airport",
          time: "07:00 PM",
          price: "₹230",
          seatsAvailable: 2,
          driver: {
            id: "d2",
            name: "Aman Joshi",
            gender: "male",
            college: "IIT",
            age: 27,
          },
          distanceKm: 32,
          duration: "50m",
        },
        {
          id: "r4",
          type: "request",
          pickup: "Cafeteria",
          dropoff: "Tech Park",
          time: "06:30 PM",
          passenger: {
            id: "p2",
            name: "Simran K",
            gender: "female",
            college: "NIFT",
            age: 23,
          },
        },
        {
          id: "r5",
          type: "offer",
          pickup: "Sports Complex",
          dropoff: "City Mall",
          time: "05:00 PM",
          price: "₹40",
          seatsAvailable: 1,
          driver: {
            id: "d3",
            name: "Sonal Patel",
            gender: "female",
            college: "MIT",
            age: 25,
          },
        },
        {
          id: "r6",
          type: "offer",
          pickup: "College Gate",
          dropoff: "Central Park",
          time: "04:15 PM",
          price: "₹55",
          seatsAvailable: 2,
          driver: {
            id: "d4",
            name: "Vikram",
            gender: "male",
            college: "IIT",
            age: 26,
          },
        },
        {
          id: "r7",
          type: "request",
          pickup: "Main Gate - College",
          dropoff: "City Mall",
          time: "11:00 AM",
          passenger: {
            id: "p3",
            name: "Kavya",
            gender: "female",
            college: "NIT",
            age: 20,
          },
        },
      ];

      setRides(sample);
      setLoading(false);
    })();

    return () => {
      // cancel
    };
  }, [pickup, dropoff, filters, tab]);

  /* -------------------------- Derived data ----------------------------- */
  const filtered = useMemo(() => {
    const arr = rides.filter((r) => r.type === tab);

    // apply simple filters (gender / college / age range)
    return arr.filter((r) => {
      // gender filter
      if (filters.gender) {
        const person = r.type === "offer" ? r.driver : r.passenger;
        if (!person?.gender || person.gender !== filters.gender) return false;
      }
      // college filter
      if (filters.college) {
        const person = r.type === "offer" ? r.driver : r.passenger;
        if (
          !person?.college ||
          !person.college.toLowerCase().includes(filters.college.toLowerCase())
        )
          return false;
      }
      // age filter (range)
      const from = filters.ageFrom ? Number(filters.ageFrom) : undefined;
      const to = filters.ageTo ? Number(filters.ageTo) : undefined;
      if (
        (from || to) &&
        (r.type === "offer" ? r.driver?.age : r.passenger?.age)
      ) {
        const age =
          (r.type === "offer" ? r.driver?.age : r.passenger?.age) ?? 0;
        if (from && age < from) return false;
        if (to && age > to) return false;
      }
      // search by pickup/dropoff text
      if (
        pickup &&
        !r.pickup?.toLowerCase().includes(pickup.toLowerCase()) &&
        !r.dropoff?.toLowerCase().includes(pickup.toLowerCase())
      )
        return false;
      if (
        dropoff &&
        !r.dropoff?.toLowerCase().includes(dropoff.toLowerCase()) &&
        !r.pickup?.toLowerCase().includes(dropoff.toLowerCase())
      )
        return false;

      return true;
    });
  }, [rides, tab, filters, pickup, dropoff]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  /* ---------------------------- handlers ------------------------------ */
  const handleOpenRide = (ride: Ride) => {
    // navigate to ride details (mock route)
    router.push(`/search-rides/${ride.id}`);
  };

  const handleClearFilters = () => {
    setFilters({ gender: "", college: "", ageFrom: "", ageTo: "" });
  };

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-4 shadow-soft mb-6">
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
                  setPage(1); /* this would trigger fetch/filter in real app */
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
              <SheetContent>
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
            <TabsList className="flex gap-2 w-full md:w-fit">
              <TabsTrigger
                value="offer"
                className="tabs-trigger flex items-center gap-2 px-4 py-2 rounded-lg"
              >
                <Icon name="Bike" /> Ride Offers
              </TabsTrigger>
              <TabsTrigger
                value="request"
                className="tabs-trigger flex items-center gap-2 px-4 py-2 rounded-lg"
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
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <Card key={i} className="p-4">
                      <Skeleton height={110} />
                    </Card>
                  ))}
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
                    <RideCard key={r.id} ride={r} onClick={handleOpenRide} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="request">
            <AnimatePresence mode="wait">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <Card key={i} className="p-4">
                      <Skeleton height={110} />
                    </Card>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
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
                    <RideCard key={r.id} ride={r} onClick={handleOpenRide} />
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
