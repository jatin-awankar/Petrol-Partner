"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { MapPin, Search, User } from "lucide-react";
// import { Skeleton } from "@/components/ui/skeleton";

interface Ride {
  id: string;
  type: "offer" | "request";
  pickup_address: string;
  drop_address: string;
  departure_time: string;
  driver_name?: string;
  passenger_name?: string;
  fare?: number;
}

const ITEMS_PER_PAGE = 5;

export default function RidesPage() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [rides, setRides] = useState<Ride[]>([]);
  const [filteredRides, setFilteredRides] = useState<Ride[]>([]);
  const [activeTab, setActiveTab] = useState<"offer" | "request">("offer");

  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [page, setPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );

  // Fetch user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          console.warn("Geolocation not available or permission denied");
        }
      );
    }
  }, []);

  // Fetch rides from backend
  useEffect(() => {
    const fetchRides = async () => {
      try {
        setIsLoading(true);
        const token = await getToken();
        if (!token) throw new Error("No token found");

        const query = new URLSearchParams();
        if (location) {
          query.append("lat", location.lat.toString());
          query.append("lng", location.lng.toString());
        }

        const res = await fetch(`/api/rides?${query.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to fetch rides");

        const data = await res.json();
        setRides(data);
        setFilteredRides(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRides();
  }, [getToken, location]);

  // Search handler
  const handleSearch = () => {
    const filtered = rides.filter(
      (ride) =>
        ride.pickup_address.toLowerCase().includes(pickup.toLowerCase()) &&
        ride.drop_address.toLowerCase().includes(drop.toLowerCase())
    );
    setFilteredRides(filtered);
    setPage(1);
  };

  // Pagination logic
  const paginatedRides = filteredRides
    .filter((r) => r.type === activeTab)
    .slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const totalPages = Math.ceil(
    filteredRides.filter((r) => r.type === activeTab).length / ITEMS_PER_PAGE
  );

  const handleRideClick = (rideId: string) => {
    router.push(`/rides/${rideId}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Pickup location"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
          />
          <Input
            placeholder="Drop location"
            value={drop}
            onChange={(e) => setDrop(e.target.value)}
          />
        </div>
        <Button onClick={handleSearch} className="flex items-center gap-2">
          <Search size={18} /> Search
        </Button>
      </div>

      <Tabs
        defaultValue="offer"
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as "offer" | "request");
          setPage(1);
        }}
      >
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="offer">Ride Offers</TabsTrigger>
          <TabsTrigger value="request">Ride Requests</TabsTrigger>
        </TabsList>

        {/* Ride Offers Section */}
        <TabsContent value="offer">
          {isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                // <Skeleton key={i} className="h-24 w-full rounded-lg" />
                <User key={i} size={24} />
              ))}
            </div>
          ) : paginatedRides.length > 0 ? (
            paginatedRides.map((ride) => (
              <Card
                key={ride.id}
                className="cursor-pointer hover:shadow-md transition"
                onClick={() => handleRideClick(ride.id)}
              >
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {ride.pickup_address} → {ride.drop_address}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(ride.departure_time).toLocaleString()}
                    </p>
                    {ride.fare && (
                      <p className="text-xs mt-1 text-green-600">
                        ₹{ride.fare} / seat
                      </p>
                    )}
                  </div>
                  <MapPin className="text-blue-500" />
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground text-center mt-4">
              No rides found.
            </p>
          )}
        </TabsContent>

        {/* Ride Requests Section */}
        <TabsContent value="request">
          {isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                // <Skeleton key={i} className="h-24 w-full rounded-lg" />
                <User key={i} size={24} />
              ))}
            </div>
          ) : paginatedRides.length > 0 ? (
            paginatedRides.map((ride) => (
              <Card
                key={ride.id}
                className="cursor-pointer hover:shadow-md transition"
                onClick={() => handleRideClick(ride.id)}
              >
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {ride.pickup_address} → {ride.drop_address}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(ride.departure_time).toLocaleString()}
                    </p>
                    <p className="text-xs mt-1 text-blue-600">
                      Requested by {ride.passenger_name}
                    </p>
                  </div>
                  <MapPin className="text-green-500" />
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground text-center mt-4">
              No requests found.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      <div className="flex justify-center items-center gap-3 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages || totalPages === 0}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
