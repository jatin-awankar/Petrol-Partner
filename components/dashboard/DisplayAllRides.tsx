import React, { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card } from "../ui/card";
import { CheckCircle, HandHeart, Users } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useRideOffers } from "@/hooks/dashboard-rides/useRideOffers";
import { useRideBookings } from "@/hooks/dashboard-rides/useRideBookings";
import { useRideRequests } from "@/hooks/dashboard-rides/useRideRequests";
import { redirect } from "next/navigation";
import RideRequestCard from "./RideRequestCard";
import RideBookedCard from "./RideBookedCard";
import RideOfferCard from "./RideOfferCard";
import { cn } from "@/lib/utils";
import SearchAndAction from "./SearchAndAction";
import { useProfile } from "@/hooks/useProfile";
import { usePagination } from "./usePagination";
import { PaginationControls } from "./PaginationControls";

// --- Empty State Component ---
const EmptyState = ({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) => (
  <Card className="p-8 text-center">
    <div className="text-muted-foreground">
      <Icon className="w-12 h-12 mx-auto mb-4" />
      <h3 className="font-semibold mb-2">{title}</h3>
      <p>{description}</p>
    </div>
  </Card>
);

// --- Main Component ---
const DisplayAllRides = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("offers");

  // --- Data Fetching Hooks ---
  const { rides, loading: ridesLoading, bookRide } = useRideOffers();
  const { bookedRides, loading: bookedRidesLoading } = useRideBookings();
  const { rideRequests, loading: requestsLoading } = useRideRequests();
  const { profile } = useProfile();
  const { user } = useUser();

  // --- Filtering Logic ---
  const filteredRidesOffers = useMemo(() => {
    if (!rides) return [];
    return rides.filter((ride) => {
      const matches = [
        ride.from_location,
        ride.to_location,
        ride.driver?.full_name,
      ].some((f) => f?.toLowerCase().includes(searchQuery.toLowerCase()));
      const isBooked = user && bookedRides?.some((b) => b.ride_id === ride.id);
      return matches && !isBooked;
    });
  }, [rides, bookedRides, searchQuery, user]);

  const filteredRideRequests = useMemo(
    () =>
      rideRequests.filter((req) =>
        [req.from_location, req.to_location, req.passenger?.full_name].some(
          (f) => f?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      ),
    [rideRequests, searchQuery]
  );

  const filteredRideBookings = useMemo(
    () =>
      bookedRides.filter((b) =>
        [
          b.ride?.from_location,
          b.ride?.to_location,
          b.ride?.driver?.full_name,
          b.ride_request?.from_location,
          b.ride_request?.to_location,
          b.ride_request?.passenger?.full_name,
        ].some((f) => f?.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [bookedRides, searchQuery]
  );

  // --- Pagination Hooks ---

  const offersPagination = usePagination(filteredRidesOffers);
  const requestsPagination = usePagination(filteredRideRequests);

  // Filter first
  const passengerBookings = useMemo(
    () =>
      filteredRideBookings.filter(
        (b) =>
          b.passenger_id === profile?.id ||
          b.ride_request?.passenger?.id === profile?.id
      ),
    [filteredRideBookings, profile]
  );

  const driverBookings = useMemo(
    () =>
      filteredRideBookings.filter((b) => b.ride?.driver?.id === profile?.id),
    [filteredRideBookings, profile]
  );

  // Paginate separately
  const passengerPagination = usePagination(passengerBookings);
  const driverPagination = usePagination(driverBookings);

  useEffect(() => {
    offersPagination.resetPage();
    requestsPagination.resetPage();
    passengerPagination.resetPage();
    driverPagination.resetPage();
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      {/* 🔍 Search + Actions */}
      <SearchAndAction
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger
            value="offers"
            className="cursor-pointer  data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Ride Offers ({filteredRidesOffers.length})
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className={cn(
              "cursor-pointer",
              activeTab === "requests"
                ? "!bg-primary-foreground text-primary-foreground"
                : ""
            )}
          >
            Ride Requests ({filteredRideRequests.length})
          </TabsTrigger>
          <TabsTrigger
            value="booked"
            className={cn(
              "cursor-pointer",
              activeTab === "booked"
                ? "!bg-primary-foreground text-primary-foreground"
                : ""
            )}
          >
            Booked Rides ({filteredRideBookings.length})
          </TabsTrigger>
        </TabsList>

        {/* Offered Rides */}
        <TabsContent value="offers" className="space-y-4">
          {ridesLoading ? (
            <p className="text-center text-muted-foreground">
              Loading rides...
            </p>
          ) : offersPagination.paginatedItems.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No rides available"
              description="Be the first to offer a ride!"
            />
          ) : (
            offersPagination.paginatedItems.map((ride) => (
              <RideOfferCard
                key={ride.id}
                ride={ride}
                onBook={() => bookRide(ride.id, 1)}
              />
            ))
          )}
          <PaginationControls
            page={offersPagination.page}
            totalPages={offersPagination.totalPages}
            onPrev={offersPagination.prevPage}
            onNext={offersPagination.nextPage}
          />
        </TabsContent>

        {/* Requested Rides */}
        <TabsContent value="requests" className="space-y-4">
          {requestsLoading ? (
            <p className="text-center text-muted-foreground">
              Loading ride requests...
            </p>
          ) : requestsPagination.paginatedItems.length === 0 ? (
            <EmptyState
              icon={HandHeart}
              title="No ride requests"
              description="Be the first to request a ride!"
            />
          ) : (
            requestsPagination.paginatedItems.map((req) => (
              <RideRequestCard
                key={req.id}
                request={req}
                onRespond={() => {}}
              />
            ))
          )}
          <PaginationControls
            page={requestsPagination.page}
            totalPages={requestsPagination.totalPages}
            onPrev={requestsPagination.prevPage}
            onNext={requestsPagination.nextPage}
          />
        </TabsContent>

        {/* Booked Rides */}
        <TabsContent value="booked" className="space-y-8">
          {bookedRidesLoading ? (
            <p className="text-center text-muted-foreground">
              Loading booked rides...
            </p>
          ) : passengerPagination.paginatedItems.length === 0 &&
            driverPagination.paginatedItems.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No booked rides"
              description="Your booked rides will appear here"
            />
          ) : (
            <>
              {/* As Passenger */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold mb-3">As Passenger</h3>
                {passengerPagination.paginatedItems.map((b) => (
                  <RideBookedCard
                    key={b.id}
                    booking={b}
                    onMessage={() => {}}
                    onTrack={() => {}}
                    onRate={() => {}}
                    onDetails={() => {}}
                  />
                ))}
                <PaginationControls
                  page={passengerPagination.page}
                  totalPages={passengerPagination.totalPages}
                  onPrev={passengerPagination.prevPage}
                  onNext={passengerPagination.nextPage}
                />
              </div>

              {/* As Driver */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold mb-3">As Driver</h3>
                {driverPagination.paginatedItems.map((b) => (
                  <RideBookedCard
                    key={b.id}
                    booking={b}
                    onMessage={() => redirect("/chat")}
                    onTrack={() => {}}
                    onRate={() => {}}
                    onDetails={() => {}}
                  />
                ))}
                <PaginationControls
                  page={driverPagination.page}
                  totalPages={driverPagination.totalPages}
                  onPrev={driverPagination.prevPage}
                  onNext={driverPagination.nextPage}
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DisplayAllRides;
